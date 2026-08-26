/**
 * SIGNALS — posting a setup to the public channel.
 *
 * Separate from lib/support/telegram.ts on purpose. Support messages go to one
 * person's private chat; these go to a broadcast channel that strangers copy
 * with real money. Different destination, different tone, different failure
 * consequences — so a change to one can never quietly alter the other.
 *
 * TELEGRAM_SIGNALS_CHAT_ID is the channel. The bot must be an administrator of
 * it before anything can be posted. If the variable is absent the route says so
 * in the logs and returns a clean error rather than pretending it sent.
 */

const API = "https://api.telegram.org";

export type Signal = {
  symbol: string;
  timeframe: string;
  side: "buy" | "sell";
  entry: number;
  stop: number;
  target: number;
  rr: number;
  confidence: number;
  regime: string;
  profile: string;
  reason: string;
  riskPct: number;
  adx: number;
  chop: number;
};

export function signalsConfigured(): boolean {
  return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_SIGNALS_CHAT_ID);
}

/** Telegram's HTML parse mode is strict about exactly these three. */
const esc = (v: string) =>
  String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A forex quote is meaningless rounded to 2dp — keep the pair's own precision. */
function price(v: number): string {
  const dp = Math.abs(v) >= 20 ? 3 : 5; // JPY crosses quote to 3, everything else 5
  return v.toFixed(dp);
}

const PRETTY_REGIME: Record<string, string> = {
  trend_up: "Trend · up",
  trend_down: "Trend · down",
  range: "Range · fading an extreme",
  transitional: "Transitional",
};

/**
 * The message people actually read.
 *
 * Deliberately plain: the levels first, because that is what somebody copying
 * it needs, then the reasoning, then the risk line. The risk line is not
 * decoration and is not optional — this is a broadcast to people who did not
 * ask us for advice, and it says plainly that it is not advice.
 */
export function formatSignal(s: Signal): string {
  const dir = s.side === "buy" ? "🟢 BUY" : "🔴 SELL";
  const pretty = s.symbol.replace(/^([A-Z]{3})([A-Z]{3})$/, "$1/$2");

  return [
    `<b>${dir} ${esc(pretty)}</b>  ·  ${esc(s.timeframe)}`,
    ``,
    `<b>Entry</b>   <code>${price(s.entry)}</code>`,
    `<b>Stop</b>    <code>${price(s.stop)}</code>`,
    `<b>Target</b>  <code>${price(s.target)}</code>`,
    ``,
    `Reward:risk <b>${s.rr.toFixed(2)}</b>  ·  confidence <b>${s.confidence}%</b>`,
    `${esc(PRETTY_REGIME[s.regime] ?? s.regime)}  ·  ADX ${s.adx.toFixed(0)}`,
    `<i>${esc(s.reason)}</i>`,
    ``,
    `Suggested risk: <b>${s.riskPct}%</b> of your balance on this trade.`,
    ``,
    `<i>Not advice. Trading carries risk and you can lose money — never risk more than you can afford to lose. Set the stop when you open the trade.</i>`,
  ].join("\n");
}

export async function postSignal(s: Signal): Promise<boolean> {
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
        text: formatSignal(s),
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("[signals] telegram rejected:", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (e) {
    console.error("[signals] telegram unreachable:", e);
    return false;
  }
}
