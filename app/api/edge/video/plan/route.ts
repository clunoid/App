import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { isAdmin } from "@/lib/billing/meter";
import { MODELS, hasAnthropic } from "@/lib/models";
import { pexelsPhotos, hasPexels } from "@/lib/data/pexels";
import { predict, predictMany, isBulkPrompt } from "@/lib/edge/engine";
import type { PredictionReport, Selection } from "@/lib/edge/types";
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

/** Turn a betting selection into a natural, number-free spoken line — a likelihood,
 *  not a bet. No odds, no percentages, no betting words, so the video reads as
 *  entertainment and won't trip social-platform gambling filters. The exact pick +
 *  % still show on screen for viewers who want them. */
function naturalCall(best: Selection | undefined, home: string, away: string, fav: string): string {
  if (!best) return "this one looks like a close call";
  const pick = best.pick;
  const team = pick.includes(home) ? home : pick.includes(away) ? away : fav;
  switch (best.category) {
    case "totals":
      return /over/i.test(pick) ? "there's a good chance we see goals in this one" : "this one could stay tight and low-scoring";
    case "btts":
      return /yes/i.test(pick) ? "both teams look likely to score" : "one side looks capable of keeping a clean sheet";
    case "double-chance":
      return /draw/i.test(pick) ? `it's hard to see ${team} losing here` : "expect a winner here — a draw looks unlikely";
    case "dnb":
      return `${team} look the likelier side to win`;
    default: // result
      return /draw/i.test(pick) ? "this one has the makings of a draw" : `there's a good chance ${team} take this one`;
  }
}

/** Best PLAY for the video: the highest-chance sensible market (double chance,
 *  DNB, over/under, or the outright) — never "no bet". Plus the outright fav for
 *  the on-screen highlight and a natural, number-free line for the voice. */
function buildMatch(rep: PredictionReport, sport: string, bg?: string): VideoMatch | null {
  const f = rep.fixture;
  const p = rep.probabilities;
  // a video needs a real prediction — skip TBD placeholders / dataless fixtures
  if (!f || !p) return null;
  const homeFav = p ? p.home >= p.away : true;
  const fav = homeFav ? f.home.name : f.away.name;
  const best = rep.verdict.bestChance;
  return {
    home: f.home.name,
    away: f.away.name,
    homeLogo: f.home.logo,
    awayLogo: f.away.logo,
    sport,
    league: rep.league?.name || "",
    leagueEmoji: rep.league?.emoji,
    winner: fav,
    winnerProb: p ? Math.max(p.home, p.away) : 0.5,
    drawProb: p?.draw,
    pick: best?.pick || fav,
    pickProb: best?.modelProb ?? (p ? Math.max(p.home, p.away) : 0.5),
    pickMarket: best?.market,
    callText: naturalCall(best, f.home.name, f.away.name, fav),
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

    // BRIEF two-voice dialogue — straight to the matches, NO intro/outro, NO
    // explanations, and NO numbers/odds/betting language (entertainment, not
    // gambling promo). Per match: one 'a' question, one 'b' natural prediction.
    const summary = matches.map((m, i) => `#${i}: ${m.home} vs ${m.away} — call: ${m.callText}`).join("\n");
    const { object: dlg } = await generateObject({
      model: MODELS.max(),
      schema: z.object({ scenes: z.array(z.object({ speaker: z.enum(["a", "b"]), line: z.string(), matchIndex: z.number() })) }),
      system:
        "You script a SHORT, upbeat two-host preview for a sports highlights video. Speaker 'a' (Isaac) NAMES the match and asks how the other sees it — ONE short line. Speaker 'b' (Matilda) replies with ONE short, natural prediction: exactly the 'call' given for that match, in her own conversational words. HARD RULES: dive STRAIGHT into the matches — no intro, no outro, no greetings, no sign-off. One short sentence per line (5–11 words). NO reasons or explanations — just the likelihood, phrased naturally ('good chance…', 'likely…', 'expect…'). NEVER say any number, scoreline, percentage, odds, or the words bet/betting/odds/stake/wager/value/money — this is entertainment, not betting advice. Per match: exactly one 'a' then one 'b', matchIndex = that match. Use the exact team names.",
      prompt: `Matches — for each, 'b' conveys this call in natural words:\n${summary}`,
      maxRetries: 1,
      maxTokens: 500,
      abortSignal: AbortSignal.timeout(30_000),
    });

    // safety net: any line that slips in a digit, % or betting word is replaced by
    // the clean deterministic version — the voice never promotes gambling
    const BAD = /\b(bet|bets|betting|bookie|bookies|odds|stake|stakes|wager|wagers|gamble|gambling|money|cash|profit|payout|units?|value|edge|percent|percentage|per cent|nil|even money|fifty-?fifty)\b/i;
    const dirty = (line: string) => /\d/.test(line) || line.includes("%") || BAD.test(line);
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1) + (/[.!?]$/.test(s) ? "" : ".");
    let scenes: VideoScene[] = dlg.scenes
      .filter((s) => s.line.trim() && s.matchIndex >= 0 && s.matchIndex < matches.length)
      .map((s) => {
        const m = matches[Math.floor(s.matchIndex)];
        const raw = s.line.trim();
        const line = dirty(raw) ? (s.speaker === "a" ? `What about ${m.home} against ${m.away}?` : cap(m.callText)) : raw.slice(0, 160);
        return { speaker: s.speaker, line, matchIndex: Math.floor(s.matchIndex) };
      });
    // ensure every match gets both a question and a spoken prediction
    const complete = matches.every((_, i) => scenes.some((s) => s.matchIndex === i && s.speaker === "b"));
    if (!complete || scenes.length < matches.length) {
      scenes = [];
      matches.forEach((m, i) => {
        scenes.push({ speaker: "a", line: `What about ${m.home} against ${m.away}?`, matchIndex: i });
        scenes.push({ speaker: "b", line: cap(m.callText), matchIndex: i });
      });
    }

    const plan: VideoPlan = { title, matches, scenes, createdAt: now.toISOString() };
    return NextResponse.json({ plan });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "plan failed" }, { status: 500 });
  }
}
