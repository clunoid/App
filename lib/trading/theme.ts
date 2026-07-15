/** Shared Clunoid Trading visual language — reused across the landing, Command
 *  Center and each platform page so the whole product reads as one system. */
export const TC = {
  bg: "#0B1730", // deep navy — matches the classic Showtime background
  panel: "rgba(255,255,255,0.032)",
  panelHi: "rgba(255,255,255,0.06)",
  line: "rgba(125,211,252,0.14)",
  text: "#eaf2fb",
  muted: "#93a7bd",
  faint: "#586a80",
  profit: "#38bdf8", // sky blue = profit / positive
  profitSoft: "#7dd3fc",
  loss: "#f2607d",
  ink: "#04121f", // dark text on the accent
} as const;

export const DOT_GRID = {
  backgroundImage: "radial-gradient(rgba(125,211,252,0.10) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
} as const;

export const monoFont = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" } as const;

/** Format a balance like a broker would: 1,234.56 CUR (or "—" when unknown). */
export function fmtBalance(balance: number | null, currency: string): string {
  if (balance == null) return "—";
  const n = balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${n} ${currency}` : n;
}
