"use client";

/**
 * Stat Battle — the "review & approve" document. The brain (Opus) produces a draft;
 * the user inspects EVERY figure, fixes/adds anything, optionally trims to a fuller
 * start year, then approves — so the battle that finally renders is exactly what they
 * want, accurate, on the FIRST try (no expensive regenerations). They can also
 * download the whole thing as a branded, self-contained HTML document.
 */
import type { RaceData, RaceEntity, RaceEvent } from "./types";

/** A flat, spreadsheet-friendly view of a RaceData that's easy to edit in a grid. */
export type EditRow = {
  name: string;
  country: string; // ISO-2 (lowercase) or ""
  color: string;
  kind: RaceEntity["kind"];
  image?: string;
  vals: (number | null)[]; // one per time column; null = "not present that year"
};
export type EditState = {
  title: string;
  subtitle: string;
  valueLabel: string;
  unitPrefix: string;
  unitSuffix: string;
  decimals: number;
  source: string;
  topN: number;
  times: number[];
  rows: EditRow[];
  // text fields are editable; the media (subjectMedia photos/logos, party/vs flags)
  // is carried READ-ONLY so it still illustrates the story in the review AND in the
  // race that plays after approval.
  events: {
    time: number;
    title: string;
    description: string;
    subjects?: string[];
    subjectMedia?: string[];
    partyCodes?: string[];
    vsCodes?: string[];
  }[];
};

/** RaceData → editable matrix (rows × time columns). */
export function editStateFromRace(race: RaceData): EditState {
  const times = race.frames.map((f) => f.time);
  const rows: EditRow[] = race.entities.map((e) => ({
    name: e.name,
    country: e.country || "",
    color: e.color,
    kind: e.kind,
    image: e.image,
    vals: race.frames.map((f) => (e.name in f.values ? f.values[e.name] : null)),
  }));
  return {
    title: race.title,
    subtitle: race.subtitle,
    valueLabel: race.valueLabel,
    unitPrefix: race.unitPrefix,
    unitSuffix: race.unitSuffix,
    decimals: race.decimals,
    source: race.source,
    topN: race.topN,
    times: times.slice(),
    rows,
    events: race.events.map((ev) => ({
      time: ev.time,
      title: ev.title,
      description: ev.description,
      subjects: ev.subjects,
      subjectMedia: ev.subjectMedia,
      partyCodes: ev.partyCodes,
      vsCodes: ev.vsCodes,
    })),
  };
}

const PACE = (span: number, frames: number) => Math.min(240, Math.max(80, Math.max(span * 2.2, frames * 6)));

/** Editable matrix → a clean RaceData ready to play (drops empty rows/cols, re-sorts). */
export function raceFromEditState(es: EditState): RaceData {
  // keep only columns (times) that have at least one real value
  const keepCol = es.times.map((_, ci) => es.rows.some((r) => typeof r.vals[ci] === "number" && (r.vals[ci] as number) > 0));
  const cols = es.times.map((t, ci) => ({ t, ci })).filter((c) => keepCol[c.ci]).sort((a, b) => a.t - b.t);
  const times = cols.map((c) => c.t);

  const seen = new Set<string>();
  const rows = es.rows
    .map((r) => ({ ...r, name: r.name.trim() }))
    .filter((r) => r.name && !seen.has(r.name) && seen.add(r.name))
    // keep an entity only if it has at least one real value somewhere
    .filter((r) => cols.some((c) => typeof r.vals[c.ci] === "number" && (r.vals[c.ci] as number) > 0));

  const entities: RaceEntity[] = rows.map((r) => ({
    name: r.name,
    color: r.color,
    kind: r.kind,
    image: r.image,
    country: /^[a-z]{2}$/.test(r.country.toLowerCase().trim()) ? r.country.toLowerCase().trim() : undefined,
  }));

  const frames = cols.map((c) => {
    const values: Record<string, number> = {};
    for (const r of rows) {
      const v = r.vals[c.ci];
      if (typeof v === "number" && v > 0) values[r.name] = v;
    }
    return { time: c.t, values };
  });

  const span = times.length ? times[times.length - 1] - times[0] : 0;
  return {
    title: es.title.trim() || "Stat Battle",
    subtitle: es.subtitle.trim(),
    valueLabel: es.valueLabel,
    unitPrefix: es.unitPrefix,
    unitSuffix: es.unitSuffix,
    timeLabel: "Year",
    decimals: es.decimals,
    source: es.source,
    entities,
    frames,
    events: es.events
      .filter((ev) => ev.title.trim() && Number.isFinite(ev.time))
      .map(
        (ev) =>
          ({
            time: ev.time,
            title: ev.title.trim(),
            description: ev.description.trim(),
            subjects: ev.subjects,
            subjectMedia: ev.subjectMedia,
            partyCodes: ev.partyCodes,
            vsCodes: ev.vsCodes,
          }) as RaceEvent
      )
      .sort((a, b) => a.time - b.time),
    topN: Math.max(3, Math.min(es.topN || 12, entities.length || 3)),
    durationSec: PACE(span, frames.length),
  };
}

/**
 * When the earliest years are too sparse to fill the chart, recommend a later start
 * where the data is full. Returns null when the start is already fine.
 */
export function recommendStart(race: RaceData): { firstYear: number; recYear: number; firstCount: number; topN: number } | null {
  if (race.frames.length < 3) return null;
  const topN = race.topN;
  const need = Math.max(3, Math.ceil(topN * 0.6)); // "full enough" = ≥60% of the bars have data
  const count = (i: number) => Object.values(race.frames[i].values).filter((v) => v > 0).length;
  const firstCount = count(0);
  if (firstCount >= need) return null; // already fine
  // earliest frame from which THIS and most following frames are full enough
  let rec = -1;
  for (let i = 1; i < race.frames.length; i++) {
    if (count(i) >= need) {
      rec = i;
      break;
    }
  }
  if (rec <= 0) return null; // never gets full — nothing better to recommend
  return { firstYear: race.frames[0].time, recYear: race.frames[rec].time, firstCount, topN };
}

/** Drop every time column before `year` (the "start from a fuller duration" action). */
export function trimEditStateToYear(es: EditState, year: number): EditState {
  const keep = es.times.map((t) => Math.round(t) >= Math.round(year));
  return {
    ...es,
    times: es.times.filter((_, i) => keep[i]),
    rows: es.rows.map((r) => ({ ...r, vals: r.vals.filter((_, i) => keep[i]) })),
    events: es.events.filter((ev) => Math.round(ev.time) >= Math.round(year)),
  };
}

/* ── value formatting for the document/grid ───────────────────────────────── */
const fmtYear = (t: number) => {
  const y = Math.floor(t);
  const m = Math.round((t - y) * 12);
  if (m <= 0 || m > 11) return `${y}`;
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m]} ${y}`;
};
export function fmtCell(v: number | null, es: { unitPrefix: string; unitSuffix: string; decimals: number }): string {
  if (v == null) return "—";
  return `${es.unitPrefix}${v.toLocaleString(undefined, { maximumFractionDigits: es.decimals })}${es.unitSuffix}`;
}

const esc = (s: string) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/** A branded, self-contained HTML document of the whole dataset — viewable, printable, downloadable. */
export function buildDataDocumentHTML(race: RaceData): string {
  const es = editStateFromRace(race);
  const range = es.times.length ? `${fmtYear(es.times[0])} – ${fmtYear(es.times[es.times.length - 1])}` : "";
  const head = es.times.map((t) => `<th>${esc(fmtYear(t))}</th>`).join("");
  const body = es.rows
    .map((r, i) => {
      const flag = r.country ? `<img src="https://flagcdn.com/w320/${esc(r.country)}.png" alt="" class="flag"/>` : "";
      const cells = r.vals.map((v) => `<td class="${v == null ? "na" : ""}">${esc(fmtCell(v, es))}</td>`).join("");
      return `<tr><td class="rk">${i + 1}</td><td class="nm"><span class="dot" style="background:${esc(r.color)}"></span>${flag}${esc(r.name)}</td>${cells}</tr>`;
    })
    .join("");
  const events = es.events
    .map((ev) => `<li><b>${esc(fmtYear(ev.time))} — ${esc(ev.title)}</b><br/><span>${esc(ev.description)}</span></li>`)
    .join("");
  const logo = `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#8a2433" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6"/><rect x="12" y="8" width="3" height="10"/><rect x="17" y="4" width="3" height="14"/></svg>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(es.title)} — Stat Battle data (clunoid.com)</title>
<style>
:root{--ink:#2c2823;--seal:#8a2433;--paper:#f3f1ea;--line:rgba(44,40,35,.14)}
*{box-sizing:border-box}
body{margin:0;background:#c9c6be;font-family:"Baloo 2",system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--ink);padding:28px}
.sheet{max-width:1100px;margin:0 auto;background:var(--paper);border:1px solid var(--line);border-radius:18px;box-shadow:0 18px 50px rgba(0,0,0,.18);overflow:hidden}
.bar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 26px;border-bottom:1px solid var(--line)}
.brand{display:flex;align-items:center;gap:10px;font-weight:800;font-size:18px}
.brand small{font-weight:700;color:var(--seal);letter-spacing:.04em;text-transform:uppercase;font-size:11px}
.seal{background:var(--seal);color:#fff;font-weight:800;border-radius:999px;padding:7px 14px;font-size:13px;letter-spacing:.02em}
.hd{padding:22px 26px 6px}
h1{margin:0;font-size:30px;letter-spacing:-.01em}
.sub{color:var(--seal);font-weight:700;margin-top:2px}
.meta{color:#2c2823aa;font-weight:600;font-size:13px;margin:8px 0 0}
.wrap{padding:14px 26px 24px;overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:13px}
th,td{padding:7px 9px;border-bottom:1px solid var(--line);white-space:nowrap;text-align:right}
th{position:sticky;top:0;background:var(--paper);font-size:11px;color:#2c2823aa;text-transform:uppercase;letter-spacing:.03em}
th:nth-child(-n+2),td:nth-child(-n+2){text-align:left}
td.rk{color:#2c2823aa;font-weight:700;width:30px}
td.nm{font-weight:800}
td.nm .dot{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:7px;vertical-align:middle}
td.nm .flag{height:13px;border-radius:2px;margin-right:6px;vertical-align:middle;box-shadow:0 0 0 1px rgba(0,0,0,.1)}
td.na{color:#2c282355}
th:last-child,td:last-child{background:rgba(138,36,51,.06);font-weight:800}
.story{padding:4px 26px 22px}
.story h2{font-size:15px;text-transform:uppercase;letter-spacing:.05em;color:#2c2823aa;margin:0 0 8px}
.story ul{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.story li{border-left:3px solid var(--seal);padding:2px 0 2px 12px;font-size:13px}
.story li span{color:#2c2823bb;font-weight:600}
.ft{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 26px;border-top:1px solid var(--line);color:#2c2823aa;font-weight:600;font-size:12px}
@media print{body{background:#fff;padding:0}.sheet{box-shadow:none;border:none}}
</style></head><body><div class="sheet">
<div class="bar"><div class="brand">${logo}<span>Stat&nbsp;Battle<br/><small>Data sheet</small></span></div><div class="seal">clunoid.com</div></div>
<div class="hd"><h1>${esc(es.title)}</h1>${es.subtitle ? `<div class="sub">${esc(es.subtitle)}</div>` : ""}
<div class="meta">${es.valueLabel ? esc(es.valueLabel) + " · " : ""}${esc(range)}${es.source ? " · Source: " + esc(es.source) : ""} · ${es.rows.length} competitors · ${es.times.length} time points</div></div>
<div class="wrap"><table><thead><tr><th>#</th><th>Competitor</th>${head}</tr></thead><tbody>${body}</tbody></table></div>
${events ? `<div class="story"><h2>Story beats</h2><ul>${events}</ul></div>` : ""}
<div class="ft"><span>Generated on clunoid.com — review &amp; edit before you create your Stat Battle.</span><span>clunoid.com/stats</span></div>
</div></body></html>`;
}

/** Trigger a browser download of the branded HTML document. */
export function downloadDataDocument(race: RaceData) {
  const html = buildDataDocumentHTML(race);
  const safe = (race.title || "stat-battle").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "stat-battle";
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safe}-clunoid-stat-battle.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
