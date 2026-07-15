"use client";

/**
 * DERIV WebSocket client (browser). Given a connected account's OAuth token, it
 * authorises, then reads the full picture the Command Center needs: every Deriv
 * (Options) account with its balance, plus every Deriv MT5 account with its
 * balance. One short-lived socket per refresh, closed when done. No token ever
 * leaves the browser.
 */
import { DERIV_WS_URL } from "./config";
import type { ConnectedAccount } from "@/lib/trading/accounts";

type Msg = Record<string, unknown> & { msg_type?: string; req_id?: number; error?: { message?: string } };

/** Authorise `token` and return every Deriv Options + MT5 account with balances. */
export async function fetchDerivPortfolio(token: string, timeoutMs = 15000): Promise<ConnectedAccount[]> {
  if (typeof window === "undefined" || !("WebSocket" in window)) throw new Error("no websocket");

  return new Promise<ConnectedAccount[]>((resolve, reject) => {
    const ws = new WebSocket(DERIV_WS_URL);
    let authLoginid = "";
    let authBalance: number | null = null;
    let authCurrency = "";
    let accountList: Msg[] = [];
    let balancesAll: Record<string, { balance?: number; currency?: string }> = {};
    let mt5: Msg[] = [];
    let gotBalance = false;
    let gotMt5 = false;

    const done = () => {
      try { ws.close(); } catch { /* ignore */ }
      const out: ConnectedAccount[] = [];
      // Deriv (Options) accounts
      for (const a of accountList) {
        const loginid = String(a.loginid || "");
        if (!loginid) continue;
        const isVirtual = !!a.is_virtual;
        const bal = balancesAll[loginid]?.balance ?? (loginid === authLoginid ? authBalance : null);
        const currency = (balancesAll[loginid]?.currency as string) || (a.currency as string) || (loginid === authLoginid ? authCurrency : "");
        out.push({ platformId: "deriv-options", broker: "Deriv", platform: "Options", loginid, currency, balance: bal ?? null, kind: "options", isVirtual });
      }
      // Deriv MT5 accounts
      for (const m of mt5) {
        const login = String(m.login || m.display_login || "");
        if (!login) continue;
        const group = String(m.group || "");
        out.push({
          platformId: "deriv-mt5",
          broker: "Deriv",
          platform: "MT5",
          loginid: login,
          currency: (m.currency as string) || "",
          balance: typeof m.balance === "number" ? (m.balance as number) : null,
          kind: "mt5",
          isVirtual: /demo/i.test(group),
        });
      }
      resolve(out);
    };

    const timer = setTimeout(() => { try { ws.close(); } catch { /* ignore */ } reject(new Error("Deriv timed out")); }, timeoutMs);

    const maybeFinish = () => {
      if (gotBalance && gotMt5) { clearTimeout(timer); done(); }
    };

    ws.onopen = () => ws.send(JSON.stringify({ authorize: token, req_id: 1 }));
    ws.onerror = () => { clearTimeout(timer); reject(new Error("Deriv connection failed")); };
    ws.onmessage = (ev) => {
      let d: Msg;
      try { d = JSON.parse(ev.data as string) as Msg; } catch { return; }
      if (d.error) { clearTimeout(timer); try { ws.close(); } catch { /* ignore */ } reject(new Error(d.error.message || "Deriv error")); return; }

      if (d.msg_type === "authorize") {
        const a = d.authorize as Msg;
        authLoginid = String(a.loginid || "");
        authBalance = typeof a.balance === "number" ? (a.balance as number) : null;
        authCurrency = String(a.currency || "");
        accountList = (a.account_list as Msg[]) || [];
        ws.send(JSON.stringify({ balance: 1, account: "all", req_id: 2 }));
        ws.send(JSON.stringify({ mt5_login_list: 1, req_id: 3 }));
      } else if (d.msg_type === "balance") {
        const b = d.balance as Msg;
        const accts = (b.accounts as Record<string, { balance?: number; currency?: string }>) || {};
        balancesAll = accts;
        gotBalance = true;
        maybeFinish();
      } else if (d.msg_type === "mt5_login_list") {
        mt5 = (d.mt5_login_list as Msg[]) || [];
        gotMt5 = true;
        maybeFinish();
      }
    };
  });
}
