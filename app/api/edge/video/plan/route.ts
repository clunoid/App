import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { isAdmin } from "@/lib/billing/meter";
import { MODELS, hasAnthropic } from "@/lib/models";
import { pexelsPhotos, hasPexels } from "@/lib/data/pexels";
import { predict, predictMany, isBulkPrompt } from "@/lib/edge/engine";
import type { PredictionReport } from "@/lib/edge/types";
import type { VideoMatch, VideoPlan, VideoScene } from "@/lib/edge/video-types";

export const runtime = "nodejs";
export const maxDuration = 150; // several predictions + web research + Opus

const SPORT_BG: Record<string, string> = {
  soccer: "football stadium floodlights crowd",
  basketball: "basketball arena court lights",
  football: "american football stadium night",
  baseball: "baseball stadium field lights",
  hockey: "ice hockey arena rink",
  mma: "mma octagon arena lights",
  tennis: "tennis stadium court night",
};

/** Best PLAY for the video: the highest-chance sensible market (double chance,
 *  DNB, over/under, or the outright) — never "no bet". Plus the outright fav for
 *  the on-screen highlight. */
function buildMatch(rep: PredictionReport, sport: string, bg?: string): VideoMatch | null {
  const f = rep.fixture;
  const p = rep.probabilities;
  // a video needs a real prediction — skip TBD placeholders / dataless fixtures
  if (!f || !p) return null;
  const homeFav = p ? p.home >= p.away : true;
  const best = rep.verdict.bestChance;
  return {
    home: f.home.name,
    away: f.away.name,
    homeLogo: f.home.logo,
    awayLogo: f.away.logo,
    sport,
    league: rep.league?.name || "",
    leagueEmoji: rep.league?.emoji,
    winner: homeFav ? f.home.name : f.away.name,
    winnerProb: p ? Math.max(p.home, p.away) : 0.5,
    drawProb: p?.draw,
    pick: best?.pick || (homeFav ? f.home.name : f.away.name),
    pickProb: best?.modelProb ?? (p ? Math.max(p.home, p.away) : 0.5),
    pickMarket: best?.market,
    edgeLine: rep.verdict.stance === "bet" ? "value at the price" : rep.verdict.stance === "lean" ? "a slight lean" : "the safest call",
    bgImage: bg,
  };
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user || !isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!hasAnthropic()) return NextResponse.json({ error: "AI not configured" }, { status: 503 });

  const prompt = ((await req.json().catch(() => ({}))) as { prompt?: string }).prompt?.trim().slice(0, 500) || "";
  if (!prompt) return NextResponse.json({ error: "name the matches" }, { status: 400 });

  try {
    const now = new Date();
    // resolve the fixtures — bulk ("all remaining World Cup fixtures") vs a few named matchups
    let reports: PredictionReport[] = [];
    let title = "Prediction video";
    if (isBulkPrompt(prompt)) {
      reports = await predictMany(prompt, now, 6); // caches standings per league internally
      title = reports[0]?.league?.name ? `${reports[0].league.name} predictions` : "Match predictions";
    } else {
      const { object: parsed } = await generateObject({
        model: MODELS.max(),
        schema: z.object({ matches: z.array(z.object({ teamA: z.string(), teamB: z.string() })).max(4), title: z.string() }),
        system: "Extract the sports matchups the user wants predicted (two competitor names each, max 4). Give a short punchy video title.",
        prompt,
        maxRetries: 1,
        maxTokens: 400,
        abortSignal: AbortSignal.timeout(30_000),
      });
      title = parsed.title || title;
      reports = (await Promise.all(parsed.matches.map((m) => predict(`Who wins ${m.teamA} vs ${m.teamB}?`).catch(() => null)))).filter(Boolean) as PredictionReport[];
    }

    // build the match cards (+ one Pexels backdrop per sport)
    const matches: VideoMatch[] = [];
    const bgCache = new Map<string, string>();
    for (const rep of reports) {
      const sport = rep.league?.sport || rep.fixture?.sport || "soccer";
      let bg = bgCache.get(sport);
      if (bg === undefined && hasPexels()) { bg = (await pexelsPhotos(SPORT_BG[sport] || "sports stadium", 3).catch(() => []))[0] || ""; bgCache.set(sport, bg); }
      const vm = buildMatch(rep, sport, bg || undefined);
      if (vm) matches.push(vm);
    }
    if (!matches.length) return NextResponse.json({ error: "couldn't resolve any of those to real fixtures — try a competition (e.g. 'World Cup') or two named teams." }, { status: 422 });

    // BRIEF two-voice dialogue — NO intro/outro, straight to the calls (keeps the
    // premium voices to only what matters). Per match: one 'a' question, one 'b' pick.
    const summary = matches.map((m, i) => `#${i}: ${m.home} vs ${m.away} (${m.league || m.sport}) — best play: ${m.pick} ${(m.pickProb * 100).toFixed(0)}% (${m.pickMarket || "result"}); outright fav ${m.winner}.`).join("\n");
    const { object: dlg } = await generateObject({
      model: MODELS.max(),
      schema: z.object({ scenes: z.array(z.object({ speaker: z.enum(["a", "b"]), line: z.string(), matchIndex: z.number() })) }),
      system:
        "Write a SHORT two-host sports-prediction dialogue. Speaker 'a' ASKS about the match in ONE tight line; speaker 'b' gives the BEST PLAY with a crisp reason and the probability in ONE line. RULES: NO intro, NO outro, NO sign-off, NO disclaimers — go STRAIGHT to the first match and STOP after the last. ElevenLabs bills per character, so every line is one short sentence (~6-14 words). Per match: exactly one 'a' then one 'b', matchIndex = that match. ALWAYS give a definitive pick (the provided 'best play') — never 'no bet'. Use the exact names and numbers given.",
      prompt: `Matches (use these picks & numbers exactly):\n${summary}`,
      maxRetries: 1,
      maxTokens: 600,
      abortSignal: AbortSignal.timeout(30_000),
    });

    let scenes: VideoScene[] = dlg.scenes.filter((s) => s.line.trim() && s.matchIndex >= 0 && s.matchIndex < matches.length).map((s) => ({ speaker: s.speaker, line: s.line.trim().slice(0, 200), matchIndex: Math.floor(s.matchIndex) }));
    if (scenes.length < matches.length) {
      scenes = [];
      matches.forEach((m, i) => {
        scenes.push({ speaker: "a", line: `${m.home} or ${m.away} — what's the play?`, matchIndex: i });
        scenes.push({ speaker: "b", line: `${m.pick}, ${(m.pickProb * 100).toFixed(0)} percent — ${m.edgeLine}.`, matchIndex: i });
      });
    }

    const plan: VideoPlan = { title, matches, scenes, createdAt: now.toISOString() };
    return NextResponse.json({ plan });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "plan failed" }, { status: 500 });
  }
}
