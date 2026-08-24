"use client";

/**
 * CREATOR PROGRAM — the practice bot, and the three steps around it.
 *
 * Most creators arrive having never traded. They are asked to screen-record a
 * bot placing trades, and the first time they try it they are fumbling through
 * a platform they have never opened — which shows in the video.
 *
 * So step 1 is the real simulator: the same Smart Recovery Differ that runs at
 * /trading/deriv/bots/sim/smart-recovery-differ, same engine, same take-profit
 * popup, fake money. Then step 2 is the voice-over and step 3 is the edit,
 * because a recording on its own is not a video.
 *
 * The balance persists between runs, so a creator can come back and carry on
 * from whatever the bot left them with — and there is no ceiling on a balance
 * they earned, only on one they type in from scratch.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Clapperboard, Play, Wallet, Info, Video, AudioLines, Scissors,
  Shuffle, Download, Check, Sparkles,
} from "lucide-react";
import { TC, DOT_GRID, monoFont } from "@/lib/trading/theme";
import { DerivBotSimRunner } from "@/components/deriv/bots/DerivBotSimRunner";
import { setSimBalance, getSimBalance, markSimEditorApplied } from "@/lib/deriv/bots/simBalance";
import { A, GOOD, VOICEOVER_STARTERS, KEYWORDS, IDEAS } from "./content";
import { ScreenRecordPrompt } from "./ScreenRecordPrompt";

/** The bot creators practise on — the flagship, so it matches what they film. */
const BOT_ID = "smart-recovery-differ";

export const MIN_PRACTICE_BALANCE = 1000;
/** The most someone can type in from scratch. A balance they GREW is not capped. */
export const MAX_TYPED_BALANCE = 92569.34;

const VOICE_SRC = "/creators/blake-voice-example.mp3";

const money = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A believable, unrepeatable balance — nobody gets the same one twice. */
function randomBalance(): number {
  const whole = Math.floor(MIN_PRACTICE_BALANCE + Math.random() * (MAX_TYPED_BALANCE - MIN_PRACTICE_BALANCE));
  const cents = Math.floor(Math.random() * 100);
  return Math.round((whole + cents / 100) * 100) / 100;
}

export function PracticeBot() {
  const [amount, setAmount] = useState(String(MIN_PRACTICE_BALANCE));
  const [saved, setSaved] = useState<number | null>(null);
  const [started, setStarted] = useState(false);
  const [askRecord, setAskRecord] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Whatever the last run left behind. Shown as a "carry on" option.
  useEffect(() => {
    const bal = getSimBalance();
    setSaved(bal);
    setAmount(String(Math.round(bal * 100) / 100));
  }, []);

  const parsed = useMemo(() => {
    const n = parseFloat(amount.replace(/,/g, ""));
    return Number.isFinite(n) ? n : NaN;
  }, [amount]);

  // A balance the bot handed them can be anything; a typed one has a ceiling.
  const cap = Math.max(MAX_TYPED_BALANCE, saved ?? 0);
  const valid = Number.isFinite(parsed) && parsed >= MIN_PRACTICE_BALANCE && parsed <= cap;

  function open(value?: number) {
    const v = value ?? parsed;
    if (!Number.isFinite(v) || v < MIN_PRACTICE_BALANCE || v > cap) {
      setErr(
        !Number.isFinite(v)
          ? "Type an amount first."
          : v < MIN_PRACTICE_BALANCE
            ? `The lowest you can start with is $${money(MIN_PRACTICE_BALANCE)}.`
            : `The highest you can type in is $${money(cap)}.`,
      );
      return;
    }
    setErr(null);
    setSimBalance(v);
    markSimEditorApplied();
    setStarted(true);
    setAskRecord(true);
  }

  if (started) {
    return (
      <>
        <DerivBotSimRunner
          botId={BOT_ID}
          backLabel="Back"
          onBack={() => { setStarted(false); setAmount(String(Math.round(getSimBalance() * 100) / 100)); setSaved(getSimBalance()); }}
          guide
        />
        {askRecord && <ScreenRecordPrompt onClose={() => setAskRecord(false)} />}
      </>
    );
  }

  const grew = saved != null && saved > MIN_PRACTICE_BALANCE;

  return (
    <main className="relative min-h-[100dvh] w-full overflow-x-hidden" style={{ background: TC.bg, color: TC.text }}>
      <div aria-hidden className="pointer-events-none absolute inset-0" style={DOT_GRID} />

      <div className="relative z-10 mx-auto w-full max-w-2xl px-5 py-5 sm:px-8">
        <header className="flex w-full flex-wrap items-center gap-3">
          <Link href="/trading/creators" className="flex items-center gap-1.5 text-[13px] font-medium transition hover:opacity-80" style={{ color: TC.muted }}>
            <ArrowLeft size={15} />
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5" style={{ background: "rgba(0,0,0,0.45)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)" }}>
            <Clapperboard size={14} style={{ color: A }} />
            <span className="text-[12.5px] font-bold tracking-tight">Start here</span>
          </span>
        </header>

        <p className="mt-6 text-[14px] leading-relaxed" style={{ color: TC.muted }}>
          Three steps and you have a video. Do them in order the first time — after that you will not need this page.
        </p>

        {/* ══ STEP 1 ═══════════════════════════════════════════════════════ */}
        <Step n={1} icon={Video} title="Screen recording" accent={A}>
          <p className="text-[13px] leading-relaxed" style={{ color: TC.muted }}>
            This is the real Smart Recovery Differ simulator — same bot, same behaviour,{" "}
            <b style={{ color: TC.text }}>fake money</b>. Pick a starting balance, open it, and record your screen
            while it trades. That recording is the footage for your video.
          </p>

          <div className="mt-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: TC.faint }}>
                Starting balance
              </span>
              <button type="button" onClick={() => { setAmount(String(randomBalance())); setErr(null); }}
                className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11.5px] font-medium transition hover:opacity-85"
                style={{ borderColor: TC.line, background: "rgba(0,0,0,0.25)", color: TC.muted }}>
                <Shuffle size={12} style={{ color: A }} /> Random
              </button>
            </div>

            <div className="mt-2 flex items-stretch gap-2">
              <div className="flex flex-1 items-center gap-1.5 rounded-xl border px-3" style={{ borderColor: valid ? `${A}77` : TC.line, background: "rgba(0,0,0,0.28)" }}>
                <span className="text-[15px] font-bold" style={{ color: TC.faint }}>$</span>
                <input
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); setErr(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") open(); }}
                  inputMode="decimal"
                  aria-label="Starting balance"
                  className="w-full min-w-0 bg-transparent py-3 text-[16px] outline-none"
                  style={{ ...monoFont, color: TC.text }}
                />
              </div>
              <button type="button" onClick={() => open()}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl px-5 text-[14px] font-semibold transition hover:opacity-90"
                style={{ background: A, color: "#12091f" }}>
                <Play size={16} /> Open the bot
              </button>
            </div>

            <div className="mt-2.5 flex flex-wrap gap-2">
              {[MIN_PRACTICE_BALANCE, 5000, 25000].map((p) => (
                <button key={p} type="button" onClick={() => { setAmount(String(p)); setErr(null); }}
                  className="rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition hover:opacity-85"
                  style={{ ...monoFont, borderColor: TC.line, background: "rgba(0,0,0,0.25)", color: parsed === p ? A : TC.muted }}>
                  ${money(p)}
                </button>
              ))}
              {grew && (
                <button type="button" onClick={() => open(saved!)}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold transition hover:opacity-85"
                  style={{ ...monoFont, borderColor: `${GOOD}66`, background: `${GOOD}14`, color: GOOD }}>
                  <Check size={12} /> Carry on from ${money(saved!)}
                </button>
              )}
            </div>

            {err && <p className="mt-3 text-[12.5px] font-medium" style={{ color: "#f2607d" }}>{err}</p>}

            <p className="mt-3 flex items-start gap-1.5 text-[11.5px] leading-relaxed" style={{ color: TC.faint }}>
              <Info size={13} className="mt-0.5 shrink-0" style={{ color: GOOD }} />
              Whatever the bot leaves you with is saved, so you can come back and carry on. Nothing here touches a
              real account — the balance, the trades and the popup are all part of the simulation, which is exactly
              why it is safe to record.
            </p>
          </div>
        </Step>

        {/* ══ STEP 2 ═══════════════════════════════════════════════════════ */}
        <Step n={2} icon={AudioLines} title="Add the voice-over" accent={A}>
          <p className="text-[13px] leading-relaxed" style={{ color: TC.muted }}>
            Talk over your recording. Say what is happening, then say what it is and where to get it. Two things you
            must get in: <b style={{ color: TC.text }}>clunoid.com</b>, and that the bots are{" "}
            <b style={{ color: GOOD }}>100% FREE</b>.
          </p>

          <ul className="mt-3 space-y-2">
            {[
              ["Your own voice or an AI voice — both are allowed.", "A realistic text-to-speech voice is completely fine. There is an example below to listen to."],
              ["You never have to show your face.", "Faceless works. Screen recording plus a voice is the format most of these videos use."],
              ["Say “I use this”.", "Speak as someone who uses it, not as the company. It lands better and it is the rule."],
              ["Start with something that works, then turn it.", "Take a hook that already performs — or a viral video in this niche — and twist it towards the bots. Never re-upload anyone's footage, just the idea."],
            ].map(([t, d]) => (
              <li key={t} className="flex gap-2">
                <Check size={14} className="mt-0.5 shrink-0" style={{ color: GOOD }} />
                <span className="text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
                  <b style={{ color: TC.text }}>{t}</b> {d}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-4 rounded-xl border p-3" style={{ borderColor: TC.line, background: "rgba(0,0,0,0.22)" }}>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: A }}>
                <AudioLines size={13} /> An AI voice, for reference
              </span>
              <a href={VOICE_SRC} download={`blake-clunoid-${Math.random().toString(36).slice(2, 8)}.mp3`}
                title="Download this example" aria-label="Download this example"
                className="rounded-lg p-1.5 transition hover:opacity-85"
                style={{ background: `${A}1f`, color: A, boxShadow: `inset 0 0 0 1px ${A}55` }}>
                <Download size={14} />
              </a>
            </div>
            <audio controls preload="none" src={VOICE_SRC} className="mt-2.5 w-full" style={{ colorScheme: "dark" }}>
              Your browser cannot play audio.
            </audio>
          </div>

          <div className="mt-4">
            <span className="text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: TC.faint }}>
              Lines you can read straight out
            </span>
            <ul className="mt-2 space-y-1.5">
              {VOICEOVER_STARTERS.map((v) => (
                <li key={v} className="rounded-lg border px-3 py-2 text-[12px] leading-relaxed"
                  style={{ borderColor: TC.line, background: "rgba(0,0,0,0.2)", color: TC.muted }}>
                  &ldquo;{v}&rdquo;
                </li>
              ))}
            </ul>
            <p className="mt-2.5 text-[11.5px] leading-relaxed" style={{ color: TC.faint }}>
              More angles — and the pivot written out for each — are in{" "}
              <Link href="/trading/creators" className="font-semibold" style={{ color: A }}>Ideas &amp; templates</Link>{" "}
              on your dashboard. A few to start with: {IDEAS.slice(0, 4).map((i) => i.t).join(" · ")}.
            </p>
          </div>
        </Step>

        {/* ══ STEP 3 ═══════════════════════════════════════════════════════ */}
        <Step n={3} icon={Scissors} title="Edit it and post it" accent={A}>
          <p className="text-[13px] leading-relaxed" style={{ color: TC.muted }}>
            Open whatever editor you already use — <b style={{ color: TC.text }}>CapCut</b> is the easiest and free,
            but InShot, VN or your phone&rsquo;s own editor are all fine. Drop the recording in, add the voice-over,
            and cut it to 30 seconds to 2 minutes.
          </p>

          <ul className="mt-3 space-y-2">
            {[
              ["Add your voice-over track.", "Line it up with what is happening on screen."],
              ["Put text on the video.", "Most people watch with the sound off, so the words have to be readable. CapCut templates and auto-captions do this in seconds."],
              ["Add a bit of sound.", "Use music from the platform's own library — quiet, under the voice."],
              ["Put clunoid.com on screen.", "In the text, at the end, or both. Say it out loud as well."],
              ["Say FREE on screen too.", "Not only in the voice-over. “100% FREE” as text removes the main reason people scroll past."],
            ].map(([t, d]) => (
              <li key={t} className="flex gap-2">
                <Check size={14} className="mt-0.5 shrink-0" style={{ color: GOOD }} />
                <span className="text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
                  <b style={{ color: TC.text }}>{t}</b> {d}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-4">
            <span className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: TC.faint }}>
              <Sparkles size={12} style={{ color: A }} /> Words worth saying and captioning
            </span>
            <p className="mt-1.5 text-[12px] leading-relaxed" style={{ color: TC.muted }}>
              These are what people search for. Work them into the voice-over and the caption naturally — no stuffing.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {KEYWORDS.map((k) => (
                <span key={k} className="rounded-lg border px-2 py-1 text-[11.5px]"
                  style={{ borderColor: TC.line, background: "rgba(0,0,0,0.22)", color: TC.muted }}>
                  {k}
                </span>
              ))}
            </div>
          </div>

          <p className="mt-4 rounded-xl border p-3 text-[12.5px] leading-relaxed"
            style={{ borderColor: `${GOOD}55`, background: `${GOOD}12`, color: TC.muted }}>
            <b style={{ color: TC.text }}>Then post it to all three of your accounts</b> and tap today on your
            dashboard calendar. That is one day done.
          </p>
        </Step>
      </div>
    </main>
  );
}

function Step({ n, icon: Icon, title, accent, children }: {
  n: number; icon: typeof Video; title: string; accent: string; children: React.ReactNode;
}) {
  return (
    <section className="mt-6 rounded-2xl border p-5 sm:p-6"
      style={{ borderColor: `${accent}44`, background: `linear-gradient(180deg, ${accent}0d, rgba(255,255,255,0.015))` }}>
      <h2 className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-[14px] font-bold"
          style={{ background: `${accent}22`, color: accent, boxShadow: `inset 0 0 0 1px ${accent}55` }}>
          {n}
        </span>
        <span className="flex items-center gap-1.5 text-[18px] font-bold sm:text-[20px]">
          <Icon size={17} style={{ color: accent }} /> {title}
        </span>
      </h2>
      <div className="mt-3.5">{children}</div>
    </section>
  );
}
