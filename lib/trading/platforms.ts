/**
 * CLUNOID TRADING — the platform/broker abstraction.
 *
 * Design rule from day one: NOTHING is hardcoded to Deriv or MT5. Every broker
 * or platform is a `TradingPlatform` descriptor plus (later) an adapter that
 * implements a common `PlatformAdapter` contract. We ship with Deriv MT5 first,
 * Deriv Options next, and cTrader / other brokers slot in by adding a descriptor
 * and an adapter — the UI and engine only ever talk to this interface, never to
 * a specific broker.
 *
 * This file is the seam. Execution adapters are intentionally stubs right now
 * (we're building step by step — landing + architecture first, live wiring
 * later), but the shape is real so nothing above it has to change when we wire
 * a broker in.
 */

/** How a platform is reached for automated execution. */
export type ExecutionModel =
  | "api" // native API places orders (e.g. Deriv Options via WebSocket)
  | "terminal-ea" // orders placed by an EA/bot inside a MetaTrader/cTrader terminal
  | "copy"; // one strategy mirrored to many accounts (broker/native copy)

export type MarketClass = "synthetics" | "forex" | "indices" | "commodities" | "stocks" | "crypto";

export type PlatformStatus = "live" | "beta" | "soon" | "planned";

export type TradingPlatform = {
  id: string; // stable key, e.g. "deriv-mt5"
  broker: string; // "Deriv"
  platform: string; // "MT5", "Options", "cTrader"
  label: string; // "Deriv · MT5"
  status: PlatformStatus;
  execution: ExecutionModel;
  markets: MarketClass[];
  /** One honest line about how automation reaches this platform. */
  note: string;
  /** Official brand logo (served from /public/logos), for real-logo UI. */
  logo?: string;
};

/**
 * The registry the whole app reads from. Adding a broker = adding an entry here
 * (and, when we go live, an adapter keyed by `id`). Order = product roadmap.
 */
export const PLATFORMS: TradingPlatform[] = [
  {
    id: "deriv-mt5",
    broker: "Deriv",
    platform: "MT5",
    label: "Deriv · MT5",
    status: "soon",
    execution: "terminal-ea",
    markets: ["synthetics", "forex", "indices", "commodities", "crypto"],
    note: "Automated via an Expert Advisor in your own MT5 terminal — you keep custody of your account.",
    logo: "/logos/deriv.png",
  },
  {
    id: "deriv-options",
    broker: "Deriv",
    platform: "Options",
    label: "Deriv · Options",
    status: "planned",
    execution: "api",
    markets: ["synthetics", "forex", "indices", "commodities", "crypto"],
    note: "Native API execution (Multipliers, Accumulators, Digital Options) — connect once, trade server-side.",
    logo: "/logos/deriv.png",
  },
  {
    id: "deriv-ctrader",
    broker: "Deriv",
    platform: "cTrader",
    label: "Deriv · cTrader",
    status: "planned",
    execution: "terminal-ea",
    markets: ["synthetics", "forex", "indices", "stocks", "crypto"],
    note: "Automated via cBots in the cTrader terminal.",
    logo: "/logos/ctrader.svg",
  },
  {
    id: "other-brokers",
    broker: "More brokers",
    platform: "MT5 / cTrader",
    label: "More brokers",
    status: "planned",
    execution: "terminal-ea",
    markets: ["forex", "indices", "commodities", "stocks", "crypto"],
    note: "The engine is broker-agnostic — other MetaTrader/cTrader brokers plug into the same interface.",
  },
];

export const platformById = (id: string): TradingPlatform | undefined => PLATFORMS.find((p) => p.id === id);

/* ── the adapter contract every broker will implement (wired later) ───────── */

export type OrderSide = "buy" | "sell";
export type OrderRequest = { symbol: string; side: OrderSide; volume: number; stopLoss?: number; takeProfit?: number };
export type OrderResult = { ok: boolean; orderId?: string; error?: string };

/**
 * The single interface the strategy engine will call, regardless of broker.
 * Deriv-MT5 fulfils it through an EA bridge; Deriv-Options through the API; a
 * future broker through its own transport. The caller never knows which.
 */
export interface PlatformAdapter {
  readonly platform: TradingPlatform;
  /** True once the account/terminal link for this platform is ready. */
  isConnected(): Promise<boolean>;
  /** Place an order on the connected account. */
  placeOrder(order: OrderRequest): Promise<OrderResult>;
}

/** Adapters are registered by platform id. Empty until we wire brokers in —
 *  the seam exists so nothing above this file changes when we do. */
export const ADAPTERS: Partial<Record<string, PlatformAdapter>> = {};
