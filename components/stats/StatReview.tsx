"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, Check, Plus, Trash2, BarChart3, Info, Sparkles, Loader2 } from "lucide-react";
import type { RaceData } from "@/lib/stats/types";
import { aiEditRace } from "@/lib/stats/generate";
import { StatGate, useStatGate } from "@/components/stats/StatGate";
import {
  type EditState,
  editStateFromRace,
  raceFromEditState,
  recommendStart,
  trimEditStateToYear,
  downloadDataDocument,
  fmtCell,
} from "@/lib/stats/review";

const INK = "#2c2823";
const SEAL = "#8a2433";

const yearLabel = (t: number) => {
  const y = Math.floor(t);
  const m = Math.round((t - y) * 12);
  return m > 0 && m < 12 ? `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m]} ${y}` : `${y}`;
};

/**
 * The review-&-approve "document": the user inspects every figure the brain produced,
 * fixes or adds anything, optionally trims to a fuller start year, downloads it, then
 * approves — and ONLY then does the battle render. Accuracy & control on the first try.
 */
export function StatReview({ race, onApprove, onBack }: { race: RaceData; onApprove: (edited: RaceData) => void; onBack: () => void }) {
  const [es, setEs] = useState<EditState>(() => editStateFromRace(race));
  const rec = useMemo(() => recommendStart(raceFromEditState(es)), [es]);
  const [ai, setAi] = useState(""); // plain-English "what to change" instruction
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState(false);
  const aiRef = useRef<HTMLTextAreaElement | null>(null);
  // Pre-flight gate: an AI edit runs Opus too, so verify auth + credits (no AI/charge) first.
  const { gate, runGate } = useStatGate();

  // The AI instruction box grows with its content (an "extending" box).
  useEffect(() => {
    const t = aiRef.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${Math.min(t.scrollHeight, 200)}px`;
  }, [ai]);

  // Let the user reshape the whole sheet with one instruction ("add more European
  // banks", "extend to 2030", "make this richest companies instead of people").
  const applyAi = async () => {
    const ins = ai.trim();
    if (!ins || aiBusy) return;
    // GATE FIRST — verify auth + credits before the (Opus) edit request is sent.
    const okToRun = await runGate(ins, "edit");
    if (!okToRun) return;
    setAiBusy(true);
    setAiErr(false);
    try {
      const edited = await aiEditRace(raceFromEditState(es), ins);
      setEs(editStateFromRace(edited));
      setAi("");
    } catch {
      setAiErr(true);
    } finally {
      setAiBusy(false);
    }
  };

  const patch = (p: Partial<EditState>) => setEs((s) => ({ ...s, ...p }));
  const setCell = (ri: number, ci: number, raw: string) => {
    const clean = raw.replace(/[, ]/g, "").trim();
    const v = clean === "" ? null : Number(clean);
    setEs((s) => {
      const rows = s.rows.map((r, i) => (i === ri ? { ...r, vals: r.vals.map((x, c) => (c === ci ? (v == null || Number.isNaN(v) ? null : v) : x)) } : r));
      return { ...s, rows };
    });
  };
  const setRow = (ri: number, p: Partial<EditState["rows"][number]>) =>
    setEs((s) => ({ ...s, rows: s.rows.map((r, i) => (i === ri ? { ...r, ...p } : r)) }));
  const addRow = () =>
    setEs((s) => ({
      ...s,
      rows: [...s.rows, { name: "New competitor", country: "", color: "#8a2433", kind: "person", vals: s.times.map(() => null) }],
    }));
  const delRow = (ri: number) => setEs((s) => ({ ...s, rows: s.rows.filter((_, i) => i !== ri) }));
  const setEvent = (ei: number, p: Partial<EditState["events"][number]>) =>
    setEs((s) => ({ ...s, events: s.events.map((e, i) => (i === ei ? { ...e, ...p } : e)) }));
  const addEvent = () => setEs((s) => ({ ...s, events: [...s.events, { time: Math.floor(s.times[s.times.length - 1] || 2026), title: "New event", description: "" }] }));
  const delEvent = (ei: number) => setEs((s) => ({ ...s, events: s.events.filter((_, i) => i !== ei) }));

  const lastCi = es.times.length - 1;
  const input = "rounded-lg bg-black/[0.06] px-2 py-1 text-[#2c2823] outline-none focus:bg-black/10";

  return (
    <div className="relative h-[100dvh] w-screen overflow-y-auto select-none" style={{ background: "#c9c6be" }}>
      <StatGate state={gate} />
      {/* sticky action bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-black/10 px-4 py-2.5 backdrop-blur-md" style={{ background: "rgba(243,241,234,0.86)" }}>
        <button onClick={onBack} className="flex h-10 items-center gap-1.5 rounded-full px-3 font-extrabold text-[#2c2823] transition hover:opacity-70">
          <ArrowLeft size={18} /> <span className="text-sm">Back</span>
        </button>
        <div className="flex items-center gap-2 font-extrabold" style={{ color: INK }}>
          <BarChart3 size={18} style={{ color: SEAL }} /> <span className="hidden text-sm sm:inline">Review your data</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => downloadDataDocument(raceFromEditState(es))}
            className="flex h-10 items-center gap-1.5 rounded-full bg-black/10 px-3.5 font-extrabold text-[#2c2823] transition hover:bg-black/20"
          >
            <Download size={17} /> <span className="hidden text-sm sm:inline">Download</span>
          </button>
          <button
            onClick={() => onApprove(raceFromEditState(es))}
            className="flex h-10 items-center gap-1.5 rounded-full px-4 font-extrabold text-white shadow-lg transition hover:scale-[1.03]"
            style={{ background: "linear-gradient(120deg,#7c3aed,#ec4899 55%,#f97316)" }}
          >
            <Check size={18} /> Approve &amp; generate
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-5">
        <div className="overflow-hidden rounded-2xl border border-black/10 shadow-xl" style={{ background: "#f3f1ea" }}>
          {/* document header */}
          <div className="flex items-center justify-between gap-3 border-b border-black/10 px-5 py-3.5">
            <div className="flex items-center gap-2.5">
              <BarChart3 size={26} style={{ color: SEAL }} />
              <div className="leading-tight">
                <div className="text-[15px] font-extrabold" style={{ color: INK }}>Stat Battle</div>
                <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: SEAL }}>Data sheet</div>
              </div>
            </div>
            <div className="rounded-full px-3.5 py-1.5 text-[13px] font-extrabold text-white" style={{ background: SEAL }}>clunoid.com</div>
          </div>

          {/* editable title / subtitle */}
          <div className="px-5 pt-4">
            <input value={es.title} onChange={(e) => patch({ title: e.target.value })} className={`${input} w-full text-2xl font-extrabold`} style={{ color: INK }} />
            <input value={es.subtitle} onChange={(e) => patch({ subtitle: e.target.value })} placeholder="Subtitle (metric · range)" className={`${input} mt-1.5 w-full text-sm font-bold`} style={{ color: SEAL }} />
            <p className="mt-2 text-xs font-semibold text-[#2c2823]/55">
              Check every figure below — fix or add anything, then approve. The present-day column is on the right.
            </p>
          </div>

          {/* Edit with AI — reshape the whole sheet with one plain-English instruction */}
          <div className="mx-5 mt-4 rounded-2xl px-4 py-4" style={{ border: "2px solid rgba(124,58,237,0.45)", background: "rgba(124,58,237,0.08)" }}>
            <div className="mb-1 flex items-center gap-2 text-base font-extrabold" style={{ color: INK }}>
              <Sparkles size={18} style={{ color: "#7c3aed" }} /> Edit with AI
            </div>
            <p className="mb-2.5 text-[13px] font-semibold text-[#2c2823]/60">
              Tell Clunoid what to change in plain English — it rewrites the data below. You can still tweak it by hand, then approve.
            </p>
            <textarea
              ref={aiRef}
              value={ai}
              onChange={(e) => setAi(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  applyAi();
                }
              }}
              rows={2}
              placeholder="e.g. Add more European banks  ·  Extend the range to 2030  ·  Make this the richest companies instead of people  ·  Set Messi's 2026 value to 915"
              disabled={aiBusy}
              className="w-full resize-none rounded-xl px-3.5 py-2.5 text-[15px] font-semibold leading-snug outline-none transition placeholder:font-medium placeholder:text-[#2c2823]/40 disabled:opacity-60"
              style={{ color: INK, background: "#ffffffcc", border: "1px solid rgba(44,40,35,0.18)" }}
            />
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[12px] font-semibold text-[#2c2823]/55">
                {aiErr ? (
                  <span style={{ color: SEAL }}>Couldn&apos;t apply that — try rephrasing.</span>
                ) : aiBusy ? (
                  "Clunoid is rebuilding your data — this takes a moment…"
                ) : (
                  "Great for turning a saved battle into a new one — just say what you want."
                )}
              </p>
              <button
                onClick={applyAi}
                disabled={aiBusy || !ai.trim()}
                className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-extrabold text-white shadow-lg transition hover:scale-[1.03] disabled:opacity-50"
                style={{ background: "linear-gradient(120deg,#7c3aed,#ec4899)" }}
              >
                {aiBusy ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> Updating…
                  </>
                ) : (
                  <>
                    <Sparkles size={18} /> Apply with AI
                  </>
                )}
              </button>
            </div>
          </div>

          {/* sparse-data recommendation */}
          {rec && (
            <div className="mx-5 mt-3 flex flex-col gap-2 rounded-xl border border-[#8a2433]/25 bg-[#8a2433]/[0.06] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2 text-[13px] font-semibold" style={{ color: INK }}>
                <Info size={16} className="mt-0.5 shrink-0" style={{ color: SEAL }} />
                <span>
                  Only {rec.firstCount} of {rec.topN} bars have data in {yearLabel(rec.firstYear)}. For a fuller race we recommend starting at <b>{yearLabel(rec.recYear)}</b> — or keep {yearLabel(rec.firstYear)} and add the missing early figures yourself.
                </span>
              </div>
              <button
                onClick={() => setEs((s) => trimEditStateToYear(s, rec.recYear))}
                className="shrink-0 rounded-full bg-[#2c2823] px-4 py-2 text-xs font-extrabold text-[#f6f4ee] transition hover:opacity-90"
              >
                Start at {yearLabel(rec.recYear)}
              </button>
            </div>
          )}

          {/* the editable data grid */}
          <div className="mt-3 overflow-x-auto px-2 pb-2">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-[#f3f1ea] px-2 py-2 text-left text-[10px] font-extrabold uppercase tracking-wide text-[#2c2823]/55">Competitor</th>
                  {es.times.map((t, ci) => (
                    <th key={ci} className={`px-2 py-2 text-right text-[10px] font-extrabold uppercase tracking-wide ${ci === lastCi ? "text-[#8a2433]" : "text-[#2c2823]/55"}`}>
                      {yearLabel(t)}{ci === lastCi ? " · now" : ""}
                    </th>
                  ))}
                  <th className="px-1" />
                </tr>
              </thead>
              <tbody>
                {es.rows.map((r, ri) => (
                  <tr key={ri} className="border-t border-black/5">
                    <td className="sticky left-0 z-10 bg-[#f3f1ea] px-2 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: r.color }} />
                        {r.country && <img src={`https://flagcdn.com/w320/${r.country}.png`} alt="" style={{ height: 13, width: "auto", borderRadius: 2, boxShadow: "0 0 0 1px rgba(0,0,0,.1)" }} />}
                        <input value={r.name} onChange={(e) => setRow(ri, { name: e.target.value })} className={`${input} w-36 font-extrabold`} />
                        <input value={r.country} onChange={(e) => setRow(ri, { country: e.target.value })} placeholder="cc" maxLength={2} className={`${input} w-9 text-center text-xs`} title="Country code (e.g. us, fr)" />
                      </div>
                    </td>
                    {es.times.map((_, ci) => (
                      <td key={ci} className={`px-1 py-1 text-right ${ci === lastCi ? "bg-[#8a2433]/[0.05]" : ""}`}>
                        <input
                          inputMode="decimal"
                          value={r.vals[ci] == null ? "" : String(r.vals[ci])}
                          onChange={(e) => setCell(ri, ci, e.target.value)}
                          placeholder="—"
                          style={{ color: INK }}
                          className={`w-24 rounded-md bg-black/[0.05] px-1.5 py-1 text-right tabular-nums outline-none placeholder:text-[#2c2823]/35 focus:bg-black/10 ${ci === lastCi ? "font-extrabold" : "font-semibold"}`}
                        />
                      </td>
                    ))}
                    <td className="px-1">
                      <button onClick={() => delRow(ri)} aria-label="Remove" className="grid h-7 w-7 place-items-center rounded-md text-[#2c2823]/45 transition hover:bg-black/10 hover:text-[#8a2433]">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={addRow} className="mt-2 ml-2 flex items-center gap-1.5 rounded-full bg-black/10 px-3.5 py-2 text-xs font-extrabold text-[#2c2823] transition hover:bg-black/20">
              <Plus size={15} /> Add competitor
            </button>
            <p className="ml-2 mt-1.5 text-[11px] font-semibold text-[#2c2823]/45">
              Values are in {es.unitPrefix || ""}{es.valueLabel || "units"}{es.unitSuffix ? ` (${es.unitSuffix.trim()})` : ""}. Leave a cell blank for a year the competitor isn&apos;t present. Example present-day value: {fmtCell(es.rows[0]?.vals[lastCi] ?? null, es)}.
            </p>
          </div>

          {/* editable story beats */}
          <div className="border-t border-black/10 px-5 py-4">
            <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-[#2c2823]/55">Story beats (the captions shown during the race)</div>
            <div className="flex flex-col gap-2">
              {es.events.map((ev, ei) => (
                <div key={ei} className="flex items-start gap-2 rounded-xl bg-black/[0.04] px-3 py-2">
                  <input value={String(ev.time)} onChange={(e) => setEvent(ei, { time: Number(e.target.value.replace(/[^0-9.]/g, "")) || ev.time })} className={`${input} w-16 shrink-0 text-center font-extrabold`} />
                  <div className="flex w-full flex-col gap-1">
                    <input value={ev.title} onChange={(e) => setEvent(ei, { title: e.target.value })} placeholder="Headline" className={`${input} w-full font-extrabold`} />
                    <textarea value={ev.description} onChange={(e) => setEvent(ei, { description: e.target.value })} placeholder="What happened (1–2 sentences)" rows={2} className={`${input} w-full resize-none text-[13px] font-medium`} />
                    {(() => {
                      // the media that illustrates this beat (read-only) — photos/logos of the
                      // subjects, else the country flags — exactly what shows during the race.
                      const subj = (ev.subjectMedia || []).filter(Boolean).slice(0, 6);
                      const flags = [...(ev.partyCodes || []), ...(ev.vsCodes || [])].filter(Boolean).slice(0, 8);
                      if (subj.length)
                        return (
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            {subj.map((u, k) => (
                              <img key={k} src={u} alt="" style={{ height: 34, width: 34, objectFit: "cover", borderRadius: 8, background: "#fff", boxShadow: "0 0 0 1px rgba(0,0,0,.12)" }} />
                            ))}
                          </div>
                        );
                      if (flags.length)
                        return (
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            {flags.map((c, k) => (
                              <img key={k} src={`https://flagcdn.com/w320/${c}.png`} alt="" style={{ height: 18, width: "auto", borderRadius: 2, boxShadow: "0 0 0 1px rgba(0,0,0,.12)" }} />
                            ))}
                          </div>
                        );
                      return null;
                    })()}
                  </div>
                  <button onClick={() => delEvent(ei)} aria-label="Remove" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[#2c2823]/45 transition hover:bg-black/10 hover:text-[#8a2433]">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={addEvent} className="mt-2 flex items-center gap-1.5 rounded-full bg-black/10 px-3.5 py-2 text-xs font-extrabold text-[#2c2823] transition hover:bg-black/20">
              <Plus size={15} /> Add story beat
            </button>
          </div>
        </div>

        {/* bottom approve (so it's reachable after scrolling) */}
        <div className="mt-4 flex items-center justify-center gap-3 pb-10">
          <button
            onClick={() => downloadDataDocument(raceFromEditState(es))}
            className="flex items-center gap-2 rounded-full bg-black/10 px-5 py-3 font-extrabold text-[#2c2823] transition hover:bg-black/20"
          >
            <Download size={18} /> Download document
          </button>
          <button
            onClick={() => onApprove(raceFromEditState(es))}
            className="flex items-center gap-2 rounded-full px-7 py-3 font-extrabold text-white shadow-xl transition hover:scale-[1.03]"
            style={{ background: "linear-gradient(120deg,#7c3aed,#ec4899 55%,#f97316)" }}
          >
            <Check size={18} /> Approve &amp; generate stat battle
          </button>
        </div>
      </div>
    </div>
  );
}
