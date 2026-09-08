/**
 * SIGNALS — posting a setup to the public channel, and telling people how it ended.
 *
 * Separate from lib/support/telegram.ts on purpose. Support messages go to one
 * person's private chat; these go to a broadcast channel that strangers copy
 * with real money. Different destination, different tone, different failure
 * consequences — so a change to one can never quietly alter the other.
 *
 * TELEGRAM_SIGNALS_CHAT_ID is the channel. The bot must be an administrator of
 * it before anything can be posted. If the variable is absent the route says so
 * in the logs and returns a clean error rather than pretending it sent.
 *
 * THREE MESSAGES, NOT ONE
 * ───────────────────────
 * A channel that only ever posts entries is the worst kind of signal service:
 * a follower has no way to know the stop moved to breakeven, or that the trade
 * is long over, and the only visible record is a wall of confident-looking
 * setups. So the engine reports the first target and the close as well, and
 * every message carries the entry price so a reader can tell at a glance which
 * setup it belongs to without us needing to store a message id anywhere.
 */

/**
 * Telegram's host, overridable only so this pipeline can be driven end to end
 * against a local stub. Something people copy with real money should be
 * testable without a live bot token and without posting to the channel to find
 * out whether it works. Unset in production, which is every environment that
 * has not deliberately set it.
 */
const API = process.env.TELEGRAM_API_BASE || "https://api.telegram.org";

export type Side = "buy" | "sell";

/** A new setup: the three prices somebody needs in order to copy it. */
export type Setup = {
  ticket: string;
  symbol: string;
  timeframe: string;
  side: Side;
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  rr1: number;
  rr2: number;
  trendScore: number;
  digits: number;
};

/** What happened to it afterwards. */
export type Followup = {
  ticket: string;
  symbol: string;
  side: Side;
  event: "tp1" | "closed";
  entry: number;
  price: number;
  r: number;
  why: string;
  digits: number;
};

export function signalsConfigured(): boolean {
  return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_SIGNALS_CHAT_ID);
}

/** Telegram's HTML parse mode is strict about exactly these three. */
const esc = (v: string) =>
  String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Prices are printed to the precision the symbol actually quotes to, and that
 * figure comes from the chart rather than from a guess here. The old version
 * inferred it — three decimals above 20, five below — which is right for forex
 * majors and wrong for gold, indices, and every crypto pair.
 */
function price(v: number, digits: number): string {
  const d = Number.isFinite(digits) ? Math.max(0, Math.min(10, Math.round(digits))) : 5;
  return v.toFixed(d);
}

/** EURUSD reads better as EUR/USD; anything else is left alone. */
const pretty = (symbol: string) => symbol.replace(/^([A-Z]{3})([A-Z]{3})$/, "$1/$2");

const signed = (r: number) => `${r > 0 ? "+" : ""}${r.toFixed(2)}R`;

/**
 * The message people actually read.
 *
 * Levels first, because that is what somebody copying it needs. Then what the
 * plan is for the second half, because a target nobody explains is a target
 * nobody manages. The risk line is not decoration and is not optional — this is
 * a broadcast to people who did not ask us for advice, and it says plainly that
 * it is not advice.
 */
export function formatSetup(s: Setup): string {
  const dir = s.side === "buy" ? "🟢 BUY" : "🔴 SELL";
  const p = (v: number) => price(v, s.digits);

  return [
    `<b>${dir} ${esc(pretty(s.symbol))}</b>  ·  ${esc(s.timeframe)}`,
    ``,
    `<b>Entry</b>  <code>${p(s.entry)}</code>`,
    `<b>Stop</b>   <code>${p(s.stop)}</code>`,
    `<b>TP1</b>    <code>${p(s.tp1)}</code>   ${s.rr1.toFixed(2)}R`,
    `<b>TP2</b>    <code>${p(s.tp2)}</code>   ${s.rr2.toFixed(2)}R`,
    ``,
    `Take half at TP1 and move the stop to entry. The rest runs to TP2.`,
    `Higher timeframes agreeing: <b>${Math.abs(s.trendScore)} of 5</b>`,
    ``,
    `<i>Not advice. Trading carries risk and you can lose money — never risk more than you can afford to lose. Set the stop when you open the trade.</i>`,
  ].join("\n");
}

/** The follow-up. Short, and it names the setup by its entry so nobody guesses. */
export function formatFollowup(f: Followup): string {
  const dir = f.side === "buy" ? "BUY" : "SELL";
  const head = `${esc(pretty(f.symbol))} ${dir} from <code>${price(f.entry, f.digits)}</code>`;

  if (f.event === "tp1") {
    return [
      `🎯 <b>TP1 hit</b> — ${head}`,
      `Half closed at <code>${price(f.price, f.digits)}</code> for <b>${signed(f.r)}</b>.`,
      `Stop is now at entry: the rest of this trade cannot lose.`,
    ].join("\n");
  }

  const won = f.r > 0;
  const icon = won ? "✅" : f.r === 0 ? "⚖️" : "🛑";
  const verb = f.why === "stop" ? "Stopped out" : f.why === "both targets" ? "TP2 hit" : "Closed at entry";

  return [
    `${icon} <b>${verb}</b> — ${head}`,
    `Out at <code>${price(f.price, f.digits)}</code> for <b>${signed(f.r)}</b>.`,
  ].join("\n");
}

async function send(text: string, tag: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_SIGNALS_CHAT_ID;
  if (!token || !chat) {
    console.error("[signals] TELEGRAM_BOT_TOKEN or TELEGRAM_SIGNALS_CHAT_ID missing");
    return false;
  }

  try {
    const res = await fetch(`${API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chat,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`[signals] telegram rejected ${tag}:`, res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[signals] telegram unreachable for ${tag}:`, e);
    return false;
  }
}

export const postSetup = (s: Setup) => send(formatSetup(s), "setup");
export const postFollowup = (f: Followup) => send(formatFollowup(f), f.event);
