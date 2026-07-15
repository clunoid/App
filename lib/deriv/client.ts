"use client";

/**
 * DERIV classic WebSocket client (browser). Given an a1- account token, it pulls
 * the FULL portfolio so nothing is hidden:
 *  - the account holder's name,
 *  - Options/trading accounts + Wallets (account_list + balance:all),
 *  - MT5 accounts (mt5_login_list),
 *  - cTrader + Deriv X CFD accounts (trading_platform_accounts),
 *  - the P2P advertiser balance (p2p_advertiser_info),
 *  - the aggregated real vs demo totals.
 *
 * This is the comprehensive path — the classic WS exposes every product. (Deriv's
 * NEW REST API only covers Options + Wallet; MT5/CFD/P2P are WS-only.) One
 * short-lived socket per refresh; the token never leaves the browser.
 */
import { DERIV_WS_URL } from "./config";
import type { ConnectedAccount } from "@/lib/trading/accounts";

type Msg = Record<string, unknown> & {
  msg_type?: string;
  req_id?: number;
  error?: { message?: string; code?: string };
};

export type DerivPortfolio = {
  name: string;
  email: string;
  accounts: ConnectedAccount[];
  totalReal: number | null;
  totalDemo: number | null;
  totalCurrency: string;
};

const num = (v: unknown): number | null =>
  typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !isNaN(Number(v)) ? Number(v) : null;

const looksDemo = (...v: (string | undefined)[]) =>
  v.some((s) => s && (/demo|virtual/i.test(s) || /^vr/i.test(s)));

// req_ids for the fan-out after authorize.
const R = { settings: 2, balance: 3, mt5: 4, ctrader: 5, dxtrade: 6, p2p: 7 } as const;

export async function fetchDerivPortfolio(token: string, timeoutMs = 20000): Promise<DerivPortfolio> {
  if (typeof window === "undefined" || !("WebSocket" in window)) throw new Error("no websocket");

  return new Promise<DerivPortfolio>((resolve, reject) => {
    const ws = new WebSocket(DERIV_WS_URL);
    let email = "", authLoginid = "", authCurrency = "";
    let authBalance: number | null = null;
    let accountList: Msg[] = [];
    let settings: Msg = {};
    let balances: Record<string, { balance?: number; currency?: string; demo_account?: number }> = {};
    let total: Record<string, { amount?: number; currency?: string }> = {};
    let mt5: Msg[] = [], ctrader: Msg[] = [], dxtrade: Msg[] = [];
    let p2p: Msg | null = null;
    let authorized = false;
    const pending = new Set<number>();

    const timer = setTimeout(() => finish(), timeoutMs); // resolve with whatever arrived

    const finish = () => {
      clearTimeout(timer);
      try { ws.close(); } catch { /* ignore */ }
      resolve(build());
    };
    const maybeFinish = () => { if (authorized && pending.size === 0) finish(); };

    const build = (): DerivPortfolio => {
      const accounts: ConnectedAccount[] = [];

      // Options + Wallets
      for (const a of accountList) {
        const loginid = String(a.loginid || "");
        if (!loginid) continue;
        const b = balances[loginid];
        const isWallet = String(a.account_category || "") === "wallet";
        accounts.push({
          platformId: isWallet ? "deriv-wallet" : "deriv-options",
          broker: "Deriv",
          platform: isWallet ? "Wallet" : "Options",
          loginid,
          currency: (b?.currency as string) || (a.currency as string) || (loginid === authLoginid ? authCurrency : ""),
          balance: num(b?.balance) ?? (loginid === authLoginid ? authBalance : null),
          kind: isWallet ? "wallet" : "options",
          isVirtual: !!a.is_virtual || b?.demo_account === 1 || looksDemo(loginid, String(a.account_type || "")),
        });
      }

      // MT5
      for (const m of mt5) {
        const login = String(m.login || m.display_login || "");
        if (!login) continue;
        accounts.push({
          platformId: "deriv-mt5", broker: "Deriv", platform: "MT5", loginid: login,
          currency: (m.currency as string) || "", balance: num(m.balance),
          kind: "mt5", isVirtual: looksDemo(String(m.group || ""), String(m.account_type || ""), login),
        });
      }

      // cTrader + Deriv X (dxtrade) — other CFD platforms
      const pushCfd = (rows: Msg[], platform: string, kind: ConnectedAccount["kind"]) => {
        for (const c of rows) {
          const id = String(c.account_id || c.login || c.display_login || "");
          if (!id) continue;
          accounts.push({
            platformId: `deriv-${platform.toLowerCase().replace(/\s+/g, "")}`, broker: "Deriv", platform, loginid: id,
            currency: (c.currency as string) || "", balance: num(c.balance),
            kind, isVirtual: looksDemo(String(c.account_type || ""), String(c.market_type || ""), id),
          });
        }
      };
      pushCfd(ctrader, "cTrader", "ctrader");
      pushCfd(dxtrade, "Deriv X", "cfd");

      // P2P advertiser balance (single balance for the user)
      if (p2p) {
        const bal = num(p2p.balance_available ?? p2p.balance);
        if (bal != null) {
          accounts.push({
            platformId: "deriv-p2p", broker: "Deriv", platform: "P2P",
            loginid: String(p2p.name || "P2P advertiser"),
            currency: String(p2p.account_currency || authCurrency || ""), balance: bal,
            kind: "p2p", isVirtual: false,
          });
        }
      }

      // Aggregated totals — prefer Deriv's own converted totals (real vs *_demo keys).
      let totalReal: number | null = null, totalDemo: number | null = null, totalCurrency = "";
      for (const [k, v] of Object.entries(total)) {
        const amt = num(v?.amount);
        if (amt == null) continue;
        if (/demo/i.test(k)) totalDemo = (totalDemo ?? 0) + amt;
        else { totalReal = (totalReal ?? 0) + amt; totalCurrency = totalCurrency || (v?.currency as string) || ""; }
      }
      if (totalReal == null) {
        const reals = accounts.filter((a) => !a.isVirtual && a.balance != null);
        if (reals.length) { totalReal = reals.reduce((s, a) => s + (a.balance || 0), 0); totalCurrency = totalCurrency || reals[0].currency; }
      }

      const name = `${String(settings.first_name || "")} ${String(settings.last_name || "")}`.trim() || email || authLoginid;
      return { name, email, accounts, totalReal, totalDemo, totalCurrency };
    };

    ws.onopen = () => ws.send(JSON.stringify({ authorize: token, req_id: 1 }));
    ws.onerror = () => { clearTimeout(timer); reject(new Error("Deriv connection failed")); };
    ws.onmessage = (ev) => {
      let d: Msg;
      try { d = JSON.parse(ev.data as string) as Msg; } catch { return; }

      if (d.msg_type === "authorize") {
        if (d.error) { clearTimeout(timer); try { ws.close(); } catch { /* ignore */ } reject(new Error(d.error.message || "Deriv authorization failed")); return; }
        const a = d.authorize as Msg;
        email = String(a.email || ""); authLoginid = String(a.loginid || "");
        authBalance = num(a.balance); authCurrency = String(a.currency || "");
        accountList = (a.account_list as Msg[]) || [];
        authorized = true;
        for (const id of Object.values(R)) pending.add(id);
        ws.send(JSON.stringify({ get_settings: 1, req_id: R.settings }));
        ws.send(JSON.stringify({ balance: 1, account: "all", req_id: R.balance }));
        ws.send(JSON.stringify({ mt5_login_list: 1, req_id: R.mt5 }));
        ws.send(JSON.stringify({ trading_platform_accounts: 1, platform: "ctrader", req_id: R.ctrader }));
        ws.send(JSON.stringify({ trading_platform_accounts: 1, platform: "dxtrade", req_id: R.dxtrade }));
        ws.send(JSON.stringify({ p2p_advertiser_info: 1, req_id: R.p2p }));
        return;
      }

      const rid = d.req_id;
      if (typeof rid !== "number") return;
      // Per-request errors are non-fatal — the product just isn't set up (e.g. no
      // P2P advertiser, no cTrader). Keep whatever else succeeded.
      if (!d.error) {
        if (d.msg_type === "get_settings") settings = (d.get_settings as Msg) || {};
        else if (d.msg_type === "balance") { const b = d.balance as Msg; balances = (b.accounts as typeof balances) || {}; total = (b.total as typeof total) || {}; }
        else if (d.msg_type === "mt5_login_list") mt5 = (d.mt5_login_list as Msg[]) || [];
        else if (d.msg_type === "trading_platform_accounts") {
          if (rid === R.ctrader) ctrader = (d.trading_platform_accounts as Msg[]) || [];
          else dxtrade = (d.trading_platform_accounts as Msg[]) || [];
        } else if (d.msg_type === "p2p_advertiser_info") p2p = (d.p2p_advertiser_info as Msg) || null;
      }
      pending.delete(rid);
      maybeFinish();
    };
  });
}
