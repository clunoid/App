/**
 * AI annotation layer — Claude explains signals; it NEVER creates or scores
 * them. Input is the fully-formed, statistically validated signal plus live
 * macro context; output is a trader-grade narrative and a macro read that the
 * terminal shows alongside the deterministic evidence. Best-effort: any failure
 * degrades to the deterministic explanation, never blocks a scan.
 *
 * Server-only (imports the app's model registry — the one deliberate seam
 * between the pure quant core and the Next app).
 */
import { generateObject } from "ai";
import { z } from "zod";
import { MODELS, hasAnthropic } from "@/lib/models";
import type { EconomicEvent, LiveSignal } from "./types";
import { fmtPrice } from "./types";

const schema = z.object({
  narrative: z.string().describe("4-6 sentences, professional desk-note tone: why this setup exists, what the market context is, what invalidates it. No hype, no advice disclaimers, no first person."),
  macroRead: z.string().describe("1-2 sentences on the macro/news backdrop for this market right now, grounded ONLY in the events provided (or 'Calendar is quiet.' if none)."),
});

export async function annotateSignal(sig: LiveSignal, events: EconomicEvent[]): Promise<string | null> {
  if (!hasAnthropic()) return null;
  const evLines = events
    .filter((e) => e.impact === "High")
    .slice(0, 8)
    .map((e) => `- ${new Date(e.at).toISOString().slice(0, 16)}Z ${e.currency} ${e.title}${e.forecast ? ` (f:${e.forecast} p:${e.previous ?? "?"})` : ""}`)
    .join("\n");
  try {
    const { object } = await generateObject({
      model: MODELS.genius(),
      schema,
      system:
        "You are a senior multi-asset desk analyst (FX, metals, energies, index futures) writing the note that accompanies a SYSTEMATIC signal. The signal was generated and validated statistically — your job is interpretation, not judgement of the system. Be concrete and calm; reference the actual levels and factors given; never invent data, prices or events.",
      prompt: `Signal: ${sig.pair} ${sig.direction.toUpperCase()} (${sig.strategy}, ${sig.timeframe})
Entry ${fmtPrice(sig.pair, sig.entry)} · Stop ${fmtPrice(sig.pair, sig.stop)} · Targets ${sig.targets.map((t) => fmtPrice(sig.pair, t)).join(", ")} · ${sig.rr}R · confidence ${sig.confidence}%
Factors: ${sig.factors.join("; ")}
Structure: ${sig.structure}
Volatility regime: ${sig.volRegime} · Session: ${sig.session}
News risk: ${sig.newsRisk.level}${sig.newsRisk.events.length ? ` (${sig.newsRisk.events.map((e) => e.title).join("; ")})` : ""}
Upcoming high-impact events (this week):
${evLines || "(none)"}`,
      maxRetries: 1,
      maxTokens: 700,
      temperature: 0.4,
      abortSignal: AbortSignal.timeout(25_000),
    });
    return `${object.narrative}\n\nMacro: ${object.macroRead}`;
  } catch {
    return null; // annotation is optional by design
  }
}
