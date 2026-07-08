import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { isAdmin } from "@/lib/billing/meter";
import { MODELS, hasAnthropic } from "@/lib/models";
import { pexelsPhotos, hasPexels } from "@/lib/data/pexels";
import { predict } from "@/lib/edge/engine";
import type { PredictionReport } from "@/lib/edge/types";
import type { VideoMatch, VideoPlan, VideoScene } from "@/lib/edge/video-types";

export const runtime = "nodejs";
export const maxDuration = 120; // several predictions + web research + two Opus calls

const SPORT_BG: Record<string, string> = {
  soccer: "football stadium floodlights crowd",
  basketball: "basketball arena court lights",
  football: "american football stadium night",
  baseball: "baseball stadium field lights",
  hockey: "ice hockey arena rink",
  mma: "mma octagon arena lights",
  tennis: "tennis stadium court night",
};

/** Predicted winner + probability from a report (a video always picks a side). */
function pickFrom(rep: PredictionReport): { winner: string; prob: number; drawProb?: number; edge: string } {
  const p = rep.probabilities;
  const f = rep.fixture;
  if (p && f) {
    const homeSide = { name: f.home.name, prob: p.home };
    const awaySide = { name: f.away.name, prob: p.away };
    const win = awaySide.prob > homeSide.prob ? awaySide : homeSide;
    const gap = Math.abs(homeSide.prob - awaySide.prob);
    const edge = win.prob >= 0.55 ? "clear favourites" : gap >= 0.08 ? "a real edge" : (p.draw ?? 0) > win.prob ? "tight — a draw is live, slight lean" : "a narrow call";
    return { winner: win.name, prob: win.prob, drawProb: p.draw, edge };
  }
  // unresolved fixture — lean on the verdict headline, default to the home name
  return { winner: rep.fixture?.home.name || rep.verdict.headline, prob: 0.5, edge: "even, marginal lean" };
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user || !isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!hasAnthropic()) return NextResponse.json({ error: "AI not configured" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { prompt?: string };
  const prompt = (body.prompt || "").trim().slice(0, 500);
  if (!prompt) return NextResponse.json({ error: "name the matches" }, { status: 400 });

  try {
    // 1) extract the matchups (cap 4 to keep the video brief + cheap)
    const { object: parsed } = await generateObject({
      model: MODELS.max(),
      schema: z.object({ matches: z.array(z.object({ teamA: z.string(), teamB: z.string() })).max(4), title: z.string() }),
      system: "Extract the sports matchups the user wants predicted. Return each as two team/competitor names. Keep at most 4. Also give a short punchy title for the video.",
      prompt,
      maxRetries: 1,
      maxTokens: 400,
      abortSignal: AbortSignal.timeout(30_000),
    });
    if (!parsed.matches.length) return NextResponse.json({ error: "couldn't find any matchups — name two teams, e.g. 'France vs Morocco'" }, { status: 400 });

    // 2) real prediction per matchup (via the same analysis engine)
    const reports = await Promise.all(parsed.matches.map((m) => predict(`Who wins ${m.teamA} vs ${m.teamB}?`).catch(() => null)));
    const matches: VideoMatch[] = [];
    const bgCache = new Map<string, string>();
    for (let i = 0; i < reports.length; i++) {
      const rep = reports[i];
      const raw = parsed.matches[i];
      if (!rep) continue;
      const pick = pickFrom(rep);
      const f = rep.fixture;
      const sport = rep.league?.sport || f?.sport || "soccer";
      let bg = bgCache.get(sport);
      if (bg === undefined && hasPexels()) {
        const imgs = await pexelsPhotos(SPORT_BG[sport] || "sports stadium", 3).catch(() => []);
        bg = imgs[0] || "";
        bgCache.set(sport, bg);
      }
      matches.push({
        home: f?.home.name || raw.teamA,
        away: f?.away.name || raw.teamB,
        homeLogo: f?.home.logo,
        awayLogo: f?.away.logo,
        sport,
        league: rep.league?.name || "",
        leagueEmoji: rep.league?.emoji,
        winner: pick.winner,
        winnerProb: pick.prob,
        drawProb: pick.drawProb,
        edgeLine: pick.edge,
        bgImage: bg || undefined,
      });
    }
    if (!matches.length) return NextResponse.json({ error: "couldn't resolve any of those matches to real fixtures" }, { status: 422 });

    // 3) a BRIEF two-voice dialogue (kept short — ElevenLabs is priced per character)
    const summary = matches.map((m, i) => `#${i}: ${m.home} vs ${m.away} (${m.league || m.sport}) — model pick: ${m.winner} ${(m.winnerProb * 100).toFixed(0)}%, ${m.edgeLine}.`).join("\n");
    const { object: dlg } = await generateObject({
      model: MODELS.max(),
      schema: z.object({ scenes: z.array(z.object({ speaker: z.enum(["a", "b"]), line: z.string(), matchIndex: z.number() })) }),
      system:
        "Write a SHORT, punchy two-host sports-prediction dialogue for a social video. Speaker 'a' is the hype host who ASKS who wins; speaker 'b' is the analyst who ANSWERS with the pick, one crisp reason, and the probability. RULES: be BRIEF — ElevenLabs bills per character, so every line is one sentence, ~6-16 words, no filler. Per match: exactly one 'a' question then one 'b' answer. Add ONE short 'a' intro line (matchIndex -1) and ONE short 'b' outro line (matchIndex -1, a confident sign-off). ALWAYS name a winner — never say 'no bet' or 'too close to call' without still giving the lean. Use the exact team names and probabilities provided. No betting-advice disclaimers in the lines.",
      prompt: `Video title: ${parsed.title}\nMatches (use these picks & numbers exactly):\n${summary}`,
      maxRetries: 1,
      maxTokens: 700,
      abortSignal: AbortSignal.timeout(30_000),
    });

    // sanitise/clamp scene refs; deterministic fallback if the model returned junk
    let scenes: VideoScene[] = dlg.scenes.filter((s) => s.line.trim() && s.matchIndex >= -1 && s.matchIndex < matches.length).map((s) => ({ speaker: s.speaker, line: s.line.trim().slice(0, 220), matchIndex: Math.floor(s.matchIndex) }));
    if (scenes.length < 2) {
      scenes = [{ speaker: "a", line: "Let's call today's biggest games.", matchIndex: -1 }];
      matches.forEach((m, i) => {
        scenes.push({ speaker: "a", line: `Who takes it — ${m.home} or ${m.away}?`, matchIndex: i });
        scenes.push({ speaker: "b", line: `I've got ${m.winner}, ${m.edgeLine}, ${(m.winnerProb * 100).toFixed(0)} percent.`, matchIndex: i });
      });
      scenes.push({ speaker: "b", line: "That's the read. Bet responsibly.", matchIndex: -1 });
    }

    const plan: VideoPlan = { title: parsed.title || "Prediction video", matches, scenes, createdAt: new Date().toISOString() };
    return NextResponse.json({ plan });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "plan failed" }, { status: 500 });
  }
}
