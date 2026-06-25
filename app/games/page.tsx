"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Flag, ArrowLeft, ArrowRight, Building2, PawPrint, Star, Sparkles } from "lucide-react";
import { useClunoid } from "@/lib/store/useClunoid";
import { IsaacOrb } from "@/components/stage/IsaacOrb";
import { ProfileMenu } from "@/components/auth/ProfileMenu";

// The engine is generic (any visual recognition challenge) — flags are just the
// first pack. These advertise what's coming next.
const COMING: { label: string; Icon: typeof Flag }[] = [
  { label: "Logos & Brands", Icon: Sparkles },
  { label: "Landmarks", Icon: Building2 },
  { label: "Animals", Icon: PawPrint },
  { label: "Famous Faces", Icon: Star },
];

const PREVIEW_FLAGS = ["us", "jp", "br", "gb", "de", "fr", "in", "ng", "it", "ca"];

export default function GamesHub() {
  const router = useRouter();
  const authChecked = useClunoid((s) => s.authChecked);
  const isAuthed = useClunoid((s) => s.user.isAuthed);

  useEffect(() => {
    if (authChecked && !isAuthed) router.replace("/");
  }, [authChecked, isAuthed, router]);

  if (!authChecked || !isAuthed) {
    return (
      <main className="stage-bg grid min-h-[100dvh] place-items-center">
        <IsaacOrb size={120} />
      </main>
    );
  }

  return (
    <main className="stage-bg min-h-[100dvh] w-full">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-center gap-2">
          <Link
            href="/home"
            aria-label="Back to Clunoid"
            className="grid h-9 w-9 place-items-center rounded-full text-ink-faint transition hover:bg-surface hover:text-ink"
          >
            <ArrowLeft size={18} />
          </Link>
          <span className="font-serif text-lg text-ink/80">clunoid</span>
        </div>
        <ProfileMenu />
      </div>

      <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-4 sm:px-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-serif text-4xl text-ink sm:text-5xl">Games</h1>
          <p className="mt-2 text-ink-muted">Quick visual challenges, hosted by Isaac.</p>
        </motion.div>

        {/* The first game — Guess the Country */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="mt-7">
          <Link
            href="/games/flags"
            className="group flex flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-soft transition hover:border-clay hover:bg-surface-2"
          >
            <div className="flex items-center gap-2.5 overflow-hidden border-b border-border bg-surface-2 px-5 py-4">
              {PREVIEW_FLAGS.map((c) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={c}
                  src={`https://flagcdn.com/h40/${c}.png`}
                  alt=""
                  className="h-9 w-auto shrink-0 rounded-md shadow ring-1 ring-black/10"
                />
              ))}
            </div>
            <div className="flex items-center gap-4 p-5">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-clay/15 text-clay">
                <Flag size={26} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-serif text-2xl text-ink">Guess the Country</h2>
                <p className="mt-0.5 text-sm text-ink-muted">
                  Name the flag before the timer runs out — speak or type, any region or difficulty.
                </p>
              </div>
              <span className="hidden shrink-0 items-center gap-1.5 rounded-full bg-clay px-5 py-2.5 text-sm font-semibold text-[#1F1E1C] transition group-hover:bg-clay-soft sm:inline-flex">
                Play <ArrowRight size={16} />
              </span>
            </div>
          </Link>
        </motion.div>

        {/* The engine is generic — more packs coming */}
        <h3 className="mb-3 mt-10 text-xs font-medium uppercase tracking-wider text-ink-faint">More games soon</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {COMING.map(({ label, Icon }) => (
            <div
              key={label}
              className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface/40 p-5 text-center opacity-60"
            >
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-surface-2 text-ink-faint">
                <Icon size={20} />
              </div>
              <span className="text-sm font-medium text-ink-muted">{label}</span>
              <span className="text-[11px] text-ink-faint">Coming soon</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
