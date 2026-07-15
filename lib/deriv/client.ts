"use client";

/**
 * DERIV WebSocket client (browser). Given a connected account's OAuth token, it
 * pulls the FULL picture so a user never wonders where their money is:
 *  - the account holder's name,
 *  - every account (Deriv Options/trading, Wallets, and MT5) with its balance,
 *  - the aggregated TOTAL (real + demo), since Deriv spreads balances across
 *    several places.
 * One short-lived socket per refresh; the token never leaves the browser.
 */
import { DERIV_WS_URL } from "./config";
import type { ConnectedAccount } from "@/lib/trading/accounts";

type Msg = Record<string, unknown> & { msg_type?: string; error?: { message?: string } };

export type DerivPortfolio = {
  name: string;
  email: string;
  accounts: ConnectedAccount[];
  totalReal: number | null;
  totalDemo: number | null;
  totalCurrency: string;
};

const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

export async function fetchDerivPortfolio(token: string, timeoutMs = 18000): Promise<DerivPortfolio> {
  if (typeof window === "undefined" || !("WebSocket" in window)) throw new Error("no websocket");

  return new Promise<DerivPortfolio>((resolve, reject) => {
    const ws = new WebSocket(DERIV_WS_URL);
    let email = "";
    let accountList: Msg[] = [];
    let authLoginid = "";
    let authBalance: number | null = null;
    let authCurrency = "";
    let settings: Msg | null = null;
    let balances: Record<string, { balance?: number; currency?: string; demo_account?: number }> = {};
    let total: Record<string, { amount?: number; currency?: string }> = {};
    let mt5: Msg[] = [];
    let gotSettings = false, gotBalance = false, gotMt5 = false;

    const timer = setTimeout(() => { try { ws.close(); } catch { /* ignore */ } reject(new Error("Deriv timed out")); }, timeoutMs);

    const finish = () => {
      if (!(gotSettings && gotBalance && gotMt5)) return;
      clearTimeout(timer);
      try { ws.close(); } catch { /* ignore */ }

      const accounts: ConnectedAccount[] = [];
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
          isVirtual: !!a.is_virtual || b?.demo_account === 1,
        });
      }
      for (const m of mt5) {
        const login = String(m.login || m.display_login || "");
        if (!login) continue;
        accounts.push({
          platformId: "deriv-mt5",
          broker: "Deriv",
          platform: "MT5",
          loginid: login,
          currency: (m.currency as string) || "",
          balance: num(m.balance),
          kind: "mt5",
          isVirtual: /demo/i.test(String(m.group || "")),
        });
      }

      // aggregated totals from Deriv's own converted totals
      let totalReal: number | null = null;
      let totalDemo: number | null = null;
      let totalCurrency = "";
      for (const [k, v] of Object.entries(total)) {
        const amt = num(v?.amount);
        if (amt == null) continue;
        if (/demo/i.test(k)) totalDemo = (totalDemo ?? 0) + amt;
        else { totalReal = (totalReal ?? 0) + amt; totalCurrency = totalCurrency || (v?.currency as string) || ""; }
      }
      // fall back to summing displayed real balances if Deriv gave no totals
      if (totalReal == null) {
        const reals = accounts.filter((a) => !a.isVirtual && a.balance != null);
        if (reals.length) { totalReal = reals.reduce((s, a) => s + (a.balance || 0), 0); totalCurrency = totalCurrency || reals[0].currency; }
      }

      const first = String(settings?.first_name || "");
      const last = String(settings?.last_name || "");
      const name = `${first} ${last}`.trim() || email || authLoginid;

      resolve({ name, email, accounts, totalReal, totalDemo, totalCurrency });
    };

    ws.onopen = () => ws.send(JSON.stringify({ authorize: token, req_id: 1 }));
    ws.onerror = () => { clearTimeout(timer); reject(new Error("Deriv connection failed")); };
    ws.onmessage = (ev) => {
      let d: Msg;
      try { d = JSON.parse(ev.data as string) as Msg; } catch { return; }
      if (d.error) { clearTimeout(timer); try { ws.close(); } catch { /* ignore */ } reject(new Error(d.error.message || "Deriv error")); return; }

      if (d.msg_type === "authorize") {
        const a = d.authorize as Msg;
        email = String(a.email || "");
        authLoginid = String(a.loginid || "");
        authBalance = num(a.balance);
        authCurrency = String(a.currency || "");
        accountList = (a.account_list as Msg[]) || [];
        ws.send(JSON.stringify({ get_settings: 1, req_id: 2 }));
        ws.send(JSON.stringify({ balance: 1, account: "all", req_id: 3 }));
        ws.send(JSON.stringify({ mt5_login_list: 1, req_id: 4 }));
      } else if (d.msg_type === "get_settings") {
        settings = (d.get_settings as Msg) || {};
        gotSettings = true; finish();
      } else if (d.msg_type === "balance") {
        const b = d.balance as Msg;
        balances = (b.accounts as typeof balances) || {};
        total = (b.total as typeof total) || {};
        gotBalance = true; finish();
      } else if (d.msg_type === "mt5_login_list") {
        mt5 = (d.mt5_login_list as Msg[]) || [];
        gotMt5 = true; finish();
      }
    };
  });
}
