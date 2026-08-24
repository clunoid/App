"use client";

/**
 * CREATOR PROGRAM — the practice bot.
 *
 * Most creators arrive having never traded. They are asked to screen-record a
 * bot placing trades, and the first time they try it they are fumbling through
 * a platform they have never opened — which shows in the video.
 *
 * So this is the real simulator, unchanged: the same Smart Recovery Differ that
 * runs at /trading/deriv/bots/sim/smart-recovery-differ, same engine, same take
 * profit popup, same everything. Fake money, no account, nothing to connect.
 * Practise setting it up, practise recording it, get the fumbling out of the way
 * before the camera is on.
 *
 * The only thing added is the balance gate in front of it: pick what the account
 * should start with, apply, and the number you chose is what shows on screen —
 * which matters, because that number is in shot for the whole recording.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Clapperboard, Play, Wallet, Info } from "lucide-react";
import { TC, DOT_GRID, monoFont } from "@/lib/trading/theme";
import { DerivBotSimRunner } from "@/components/deriv/bots/DerivBotSimRunner";
import { setSimBalance, markSimEditorApplied } from "@/lib/deriv/bots/simBalance";
import { A, GOOD } from "./content";

/** The bot creators practise on — the flagship, so it matches what they film. */
const BOT_ID = "smart-recovery-differ";

export const MIN_PRACTICE_BALANCE = 1000;
export const MAX_PRACTICE_BALANCE = 92569.34;

const PRESETS = [1000, 5000, 25000, MAX_PRACTICE_BALANCE];

const money = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function PracticeBot() {
  const [amount, setAmount] = useState(String(MIN_PRACTICE_BALANCE));
  const [started, setStarted] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const parsed = useMemo(() => {
    const n = parseFloat(amount.replace(/,/g, ""));
    return Number.isFinite(n) ? n : NaN;
  }, [amount]);

  const valid = Number.isFinite(parsed) && parsed >= MIN_PRACTICE_BALANCE && parsed <= MAX_PRACTICE_BALANCE;

  function apply() {
    if (!valid) {
      setErr(
        !Number.isFinite(parsed)
          ? "Type an amount first."
          : parsed < MIN_PRACTICE_BALANCE
            ? `The lowest you can start with is $${money(MIN_PRACTICE_BALANCE)}.`
            : `The highest you can start with is $${money(MAX_PRACTICE_BALANCE)}.`,
      );
      return;
    }
    setErr(null);
    // The simulator reads its balance from here, so applying before it mounts is
    // what puts the chosen number on screen.
    setSimBalance(parsed);
    markSimEditorApplied();
    setStarted(true);
  }

  // Once applied, hand over to the real thing.
  if (started) {
    return <DerivBotSimRunner botId={BOT_ID} backHref="/trading/creators" backLabel="Creator Program" />;
  }

  return (
    <main className="relative min-h-[100dvh] w-full overflow-x-hidden" style={{ background: TC.bg, color: TC.text }}>
      <div aria-hidden className="pointer-events-none absolute inset-0" style={DOT_GRID} />

      <div className="relative z-10 mx-auto w-full max-w-2xl px-5 py-5 sm:px-8">
        <header className="flex w-full flex-wrap items-center gap-3">
          <Link href="/trading/creators" className="flex items-center gap-1.5 text-[13px] font-medium transition hover:opacity-80" style={{ color: TC.muted }}>
            <ArrowLeft size={15} /> <span className="hidden sm:inline">Creator Program</span>
          </Link>
          <span className="hidden h-4 w-px sm:block" style={{ background: TC.line }} />
          <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5" style={{ background: "rgba(0,0,0,0.45)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)" }}>
            <Clapperboard size={14} className="hidden sm:block" style={{ color: A }} />
            <span className="text-[12.5px] font-bold tracking-tight">Start here</span>
          </span>
        </header>

        <section className="mt-8">
          <h1 className="text-[26px] font-bold leading-tight sm:text-[32px]">Practise on a real bot first</h1>
          <p className="mt-3 text-[14px] leading-relaxed" style={{ color: TC.muted }}>
            This is the actual Smart Recovery Differ simulator — same bot, same behaviour, <b style={{ color: TC.text }}>fake
            money</b>. No account, nothing to connect, nothing to lose.
          </p>
          <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: TC.muted }}>
            Run it a few times before you record anything for real. Learn where the buttons are, watch how the trades
            come in, practise your screen recording and your voice-over on it. The videos that do well are the ones
            where the creator clearly knows what they are showing.
          </p>
        </section>

        <section className="mt-7 rounded-2xl border p-5 sm:p-6" style={{ borderColor: `${A}55`, background: `linear-gradient(180deg, ${A}10, rgba(255,255,255,0.015))` }}>
          <h2 className="flex items-center gap-2 text-[16px] font-bold">
            <Wallet size={17} style={{ color: A }} /> Set your starting balance
          </h2>
          <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
            This is the number that sits on screen for the whole recording, so pick one that looks right for the video
            you have in mind. Between <b style={{ color: TC.text }}>${money(MIN_PRACTICE_BALANCE)}</b> and{" "}
            <b style={{ color: TC.text }}>${money(MAX_PRACTICE_BALANCE)}</b>.
          </p>

          <div className="mt-4 flex items-stretch gap-2">
            <div className="flex flex-1 items-center gap-1.5 rounded-xl border px-3" style={{ borderColor: valid ? `${A}77` : TC.line, background: "rgba(0,0,0,0.28)" }}>
              <span className="text-[15px] font-bold" style={{ color: TC.faint }}>$</span>
              <input
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setErr(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") apply(); }}
                inputMode="decimal"
                aria-label="Starting balance"
                className="w-full min-w-0 bg-transparent py-3 text-[16px] outline-none"
                style={{ ...monoFont, color: TC.text }}
              />
            </div>
            <button
              type="button"
              onClick={apply}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl px-5 text-[14px] font-semibold transition hover:opacity-90"
              style={{ background: A, color: "#12091f" }}
            >
              <Play size={16} /> Apply
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button key={p} type="button" onClick={() => { setAmount(String(p)); setErr(null); }}
                className="rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition hover:opacity-85"
                style={{ ...monoFont, borderColor: TC.line, background: "rgba(0,0,0,0.25)", color: parsed === p ? A : TC.muted }}>
                ${money(p)}
              </button>
            ))}
          </div>

          {err && <p className="mt-3 text-[12.5px] font-medium" style={{ color: "#f2607d" }}>{err}</p>}

          <p className="mt-4 flex items-start gap-1.5 text-[11.5px] leading-relaxed" style={{ color: TC.faint }}>
            <Info size={13} className="mt-0.5 shrink-0" style={{ color: GOOD }} />
            Nothing here touches a real account. The balance, the trades and the take-profit popup are all part of the
            simulation — which is exactly why it is safe to record.
          </p>
        </section>
      </div>
    </main>
  );
}
