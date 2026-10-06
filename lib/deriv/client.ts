/**
 * DERIV PORTFOLIO — the shape the command center shows.
 *
 * The classic WebSocket client that used to live here read the portfolio with
 * legacy a1- tokens over ws.derivws.com, on Deriv's public app id 1089. It is
 * gone: Clunoid reads accounts with its own app, 33PP…, through the new REST
 * API (lib/deriv/api.ts), so every Deriv call — and every trade — is the app's.
 */
import type { ConnectedAccount } from "@/lib/trading/accounts";

export type DerivPortfolio = {
  name: string;
  email: string;
  accounts: ConnectedAccount[];
  totalReal: number | null;
  totalDemo: number | null;
  totalCurrency: string;
};
