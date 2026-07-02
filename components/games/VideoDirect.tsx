"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Clapperboard, Loader2, Sparkles } from "lucide-react";
import { ProfileMenu } from "@/components/auth/ProfileMenu";
import { HostVoicePicker } from "@/components/games/HostVoicePicker";
import { ShareModal } from "@/components/share/ShareModal";
import { planVideoGame } from "@/lib/games/generate";
import { buildGameReel } from "@/lib/games/reel";
import { renderFlagReelVideo } from "@/lib/share/renderer-web";
import { saveGameResult, type GameSnapshot } from "@/lib/games/storage";
import { getVideoVoicePref, isPremiumVideoVoice, voiceById } from "@/lib/voice/preference";
import { videoDirectStatus, type VideoDirectStatus } from "@/lib/video/status";
import { useBilling } from "@/lib/billing/store";
import type { ReelAspect } from "@/lib/share/reel";

const EXAMPLES = ["20 African countries", "Hard European flags", "All world flags", "Island nations", "South American flags", "Flags with stars"];

/**
 * VIDEO DIRECT — go straight from a prompt to a shareable flag recap video (no play).
 * Enter any prompt, pick a voice, hit Generate; Opus plans the full game and the
 * ShareModal renders it (WebCodecs, background-safe) at 9:16 / 16:9 / both. Free tier
 * gets 2 premium-voice videos/month; premium videos are saved to the game history.
 */
export function VideoDirect({ initialRequest }: { initialRequest?: string }) {
  const [request, setRequest] = useState(initialRequest || "");
  const [voice, setVoice] = useState<string>(() => getVideoVoicePref());
  const [quota, setQuota] = useState<VideoDirectStatus | null>(null);
  const [planning, setPlanning] = useState(false);
  const [err, setErr] = useState("");
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [gameId, setGameId] = useState<string | undefined>(undefined);
  const [shareOpen, setShareOpen] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const openUpgrade = useBilling((s) => s.openUpgrade);

  const refreshQuota = useCallback(() => {
    void videoDirectStatus().then(setQuota);
  }, []);
  useEffect(() => {
    refreshQuota();
  }, [refreshQuota]);

  // Textarea auto-grows with its content.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`;
  }, [request]);

  const premium = isPremiumVideoVoice(voice);
  const outOfFree = premium && !!quota && !quota.subscriber && quota.remaining === 0;
  const canGenerate = request.trim().length > 0 && !planning && !outOfFree;

  const generate = useCallback(async () => {
    const req = request.trim();
    if (!req || planning) return;
    if (premium && quota && !quota.subscriber && quota.remaining === 0) {
      openUpgrade("You've used your 2 free premium-voice videos this month. Subscribe for unlimited videos.");
      return;
    }
    setErr("");
    setPlanning(true);
    const res = await planVideoGame(req, voice);
    setPlanning(false);
    if (!res.ok) {
      if (res.reason === "video_limit") {
        openUpgrade("You've used your 2 free premium-voice videos this month. Subscribe for unlimited videos.");
        refreshQuota();
      } else if (res.reason === "credits") {
        openUpgrade("You don't have enough credits to generate this video. Add credits or subscribe to keep creating.");
      } else if (res.reason === "auth") {
        setErr("Please sign in to generate a video.");
      } else {
        setErr("Couldn't build that one — try rephrasing the flags you want.");
      }
      return;
    }
    const g = res.game;
    const snap: GameSnapshot = {
      title: g.title,
      subtitle: g.subtitle,
      score: 0,
      total: g.rounds.length,
      answerMode: "choice", // the document ("official") background
      hue: 210,
      secs: g.secondsPerRound,
      rounds: g.rounds,
      // reveal-only log (no play): every round is a clean reveal, no user guess.
      replay: g.rounds.map((r) => ({ code: r.code, flag: r.flag, name: r.name, said: "", correct: true, difficulty: r.difficulty })),
    };
    const id = await saveGameResult(snap); // save to Guess-the-Country history
    setSnapshot(snap);
    setGameId(id ?? undefined);
    setShareOpen(true);
    if (premium) refreshQuota();
  }, [request, planning, premium, quota, voice, openUpgrade, refreshQuota]);

  const voiceLabel = voice === "silent" ? "Silent" : voiceById(voice)?.name ?? "Isaac";
  const longWarn = /\ball\b|\bworld\b|\bevery\b/i.test(request);

  return (
    <div className="relative min-h-[100dvh] w-full overflow-x-hidden bg-gradient-to-b from-[#1b1a24] via-[#17161d] to-[#121118] text-white">
      {/* header */}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-white/10 bg-[#141018]/80 px-4 py-3 backdrop-blur sm:px-6">
        <Link href="/games/flags" className="flex items-center gap-1.5 rounded-full px-2 py-1 text-sm font-bold text-white/70 transition hover:bg-white/10 hover:text-white">
          <ArrowLeft size={18} /> <span className="hidden sm:inline">Back</span>
        </Link>
        <span className="text-[15px] font-extrabold tracking-tight">clunoid</span>
        <ProfileMenu />
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pb-28 pt-6 sm:px-6 sm:pt-10">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-[#FFD400]">
            <Clapperboard size={22} />
            <span className="text-xs font-extrabold uppercase tracking-widest text-white/60">Video Direct</span>
          </div>
          <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">Generate a flag video</h1>
          <p className="text-[15px] text-white/60">Describe the flags you want and Clunoid builds the whole recap — intro, each flag, and outro — ready to post. No playing required.</p>
        </div>

        {/* prompt */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold uppercase tracking-wide text-white/50">Your prompt</label>
          <textarea
            ref={taRef}
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate();
            }}
            rows={2}
            maxLength={600}
            placeholder="e.g. 20 African countries · hard European flags · all world flags"
            className="w-full resize-none rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-3 text-[16px] font-semibold text-white placeholder:text-white/35 outline-none transition focus:border-[#FFD400]/60 focus:bg-white/10"
          />
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setRequest(ex)}
                className="rounded-full bg-white/[0.07] px-3 py-1.5 text-[13px] font-bold text-white/75 transition hover:bg-white/15 hover:text-white"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>

        {/* voice */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold uppercase tracking-wide text-white/50">Voice</label>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-2">
            <HostVoicePicker mode="video" onPick={setVoice} />
          </div>
          {/* quota strip — premium free-tier only */}
          {premium && quota && !quota.subscriber && quota.remaining != null && (
            <div className="flex items-center justify-between gap-2 rounded-xl bg-[#FFD400]/10 px-3 py-2 text-[13px] font-bold text-[#FFD400]">
              <span>{quota.remaining > 0 ? `${quota.remaining} of ${quota.limit} free ${voiceLabel} videos left this month` : `No free ${voiceLabel} videos left this month`}</span>
              {quota.remaining === 0 && (
                <button type="button" onClick={() => openUpgrade("Subscribe for unlimited premium-voice videos.")} className="shrink-0 rounded-full bg-[#FFD400] px-3 py-1 text-[12px] font-extrabold text-black">
                  Upgrade
                </button>
              )}
            </div>
          )}
          {premium && quota?.subscriber && <p className="px-1 text-[13px] font-bold text-emerald-300">Unlimited {voiceLabel} videos</p>}
        </div>

        {err && <p className="rounded-xl bg-red-500/15 px-3 py-2 text-[13px] font-bold text-red-200">{err}</p>}
        {longWarn && <p className="px-1 text-[12px] text-white/45">Heads-up: a very large set (like all world flags) makes a long video and takes a few minutes to render — keep this tab open.</p>}
      </main>

      {/* sticky generate bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[#141018]/90 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <p className="hidden flex-1 text-[13px] text-white/45 sm:block">You’ll pick vertical / wide / both on the next screen.</p>
          <button
            type="button"
            onClick={generate}
            disabled={!canGenerate}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-[#FFD400] px-6 py-3.5 text-[16px] font-extrabold text-black transition enabled:hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
          >
            {planning ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} />}
            {planning ? "Planning…" : "Generate video"}
          </button>
        </div>
      </div>

      {snapshot && (
        <ShareModal
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          render={(a: ReelAspect, o) => renderFlagReelVideo(buildGameReel(snapshot, a, o.branded !== false, true), o)}
          renderVoiceFromPref
          gameId={gameId}
          fileName={`clunoid-${(snapshot.subtitle || snapshot.title || "flags").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) || "flags"}`}
          heading="Your flag video"
          idleHint="Your video is ready to create."
          caption={`Can you name ${snapshot.total > 1 ? "these flags" : "this flag"}? 🌍 Made on clunoid.com`}
          captionContext={{ title: snapshot.title, subtitle: snapshot.subtitle, kind: "guess the country flag video" }}
        />
      )}
    </div>
  );
}
