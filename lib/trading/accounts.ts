/**
 * CLUNOID TRADING — the platform-agnostic "connected account" shape.
 *
 * Central Command shows every account the user has connected, across every
 * platform, in one uniform list. Each platform (Deriv, later cTrader, other
 * brokers) produces `ConnectedAccount`s from its own connect flow — the hub
 * never knows broker specifics, only this shape. That's what keeps "one place
 * to control all your accounts" broker-agnostic.
 */
export type AccountKind = "options" | "mt5" | "ctrader" | "cfd";

export type ConnectedAccount = {
  platformId: string; // matches lib/trading/platforms id, e.g. "deriv-mt5"
  broker: string; // "Deriv"
  platform: string; // "MT5" | "Options"
  loginid: string; // the broker account id (e.g. CR1234567 or an MT5 login)
  currency: string;
  balance: number | null; // null until fetched / when unavailable
  kind: AccountKind;
  isVirtual: boolean; // demo vs real
};
