/**
 * AI reasoning overlay. The statistical model (model.ts) produces the numbers;
 * top-tier Claude (MODELS.max = Opus 4.8) reads them together with the gathered
 * evidence and live research, and writes the human explanation, the qualitative
 * risk read, and a bounded confidence adjustment. HARD RULE: it INTERPRETS — it
 * never invents probabilities, prices, injuries or results. Best-effort: any
 * failure degrades to the deterministic model output, never blocks a report.
 */
import { generateObject } from "ai";
import { z } from "zod";
import { MODELS, hasAnthropic } from "@/lib/models";
import type { Evidence, ModelProbabilities, Selection } from "./types";

const schema = z.object({
  reasoning: z.string().describe("4-8 sentences, sharp analyst tone: what the model says, what the live context (form, injuries, H2H, motivation) adds or subtracts, and why the stance follows. Reference ONLY the evidence/numbers provided. No hype, no guarantees."),
  risks: z.array(z.string()).describe("2-4 concrete things that would invalidate the read (e.g. 'lineup not confirmed', 'key striker fitness', 'dead rubber')."),
  confidenceDelta: z.number().describe("Bounded adjustment to overall confidence, -15..+10, based ONLY on qualitative context quality — negative when info is missing/unstable, small positive when evidence strongly corroborates the model. Never invent certainty."),
  endorseNoBet: z.boolean().describe("true if the honest conclusion is that there is not enough edge/evidence to bet, regardless of the headline pick."),
});

export type AiOverlay = z.infer<typeof schema>;

export async function reasonOverPrediction(input: {
  question: string;
  fixtureLine: string;
  prob: ModelProbabilities | null;
  selections: Selection[];
  evidence: Evidence[];
  research?: string;
  stanceReason: string;
}): Promise<AiOverlay | null> {
  if (!hasAnthropic()) return null;
  const probLine = input.prob
    ? `Model: home ${(input.prob.home * 100).toFixed(0)}%${input.prob.draw != null ? `, draw ${(input.prob.draw * 100).toFixed(0)}%` : ""}, away ${(input.prob.away * 100).toFixed(0)}% (${input.prob.method}${input.prob.expHome != null ? `; xG-style λ ${input.prob.expHome} vs ${input.prob.expAway}` : ""}).`
    : "No reliable statistical model could be built (thin data).";
  const selLines = input.selections.slice(0, 5).map((s) => `- ${s.market}: ${s.pick} — model ${(s.modelProb * 100).toFixed(0)}%${s.bookOdds ? `, book ${s.bookOdds.toFixed(2)}` : ""}${s.edgePct != null ? `, edge ${s.edgePct}%` : ""}`).join("\n") || "(none)";
  const evLines = input.evidence.map((e) => `- [${e.kind}] ${e.text}${e.source ? ` (${e.source})` : ""}`).join("\n") || "(none)";
  try {
    const { object } = await generateObject({
      model: MODELS.max(),
      schema,
      system:
        "You are a rigorous, sober sports-betting analyst on a decision-support desk. The statistical model and evidence are given to you; your job is to INTERPRET them into a clear read, NOT to invent data. Never fabricate a number, price, injury, lineup or result. Treat 'no bet' as a valid, respectable conclusion when the edge or evidence is thin. Be honest about uncertainty; never promise a winning outcome.",
      prompt: `Question: ${input.question}
Fixture: ${input.fixtureLine}
${probLine}
Candidate selections (value = model vs de-vigged market):
${selLines}
Evidence gathered (real provider + web data):
${evLines}
${input.research ? `Live research digest:\n${input.research}\n` : ""}Model's mechanical stance rationale: ${input.stanceReason}

Write the analyst read.`,
      maxRetries: 1,
      maxTokens: 900,
      abortSignal: AbortSignal.timeout(30_000),
    });
    return { ...object, confidenceDelta: Math.max(-15, Math.min(10, object.confidenceDelta)) };
  } catch {
    return null;
  }
}
