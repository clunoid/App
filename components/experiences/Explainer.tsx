"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { Download } from "lucide-react";
import { useClunoid } from "@/lib/store/useClunoid";
import type { ExplainerExperience, ExplainerEntity, SummarySection } from "@/lib/brain/scene";
import { downloadMedia } from "@/lib/utils";

/**
 * Synced visual narration, full-screen two-column on wide screens:
 *  - LEFT: the current beat's media — a VIDEO clip or full-size image
 *    (uncropped), with earlier ones shrunk into a timeline (hover to enlarge).
 *  - RIGHT: the info card with the full explanation, current beat highlighted.
 * Media-only on the left (no labels/initials). All media is preloaded so there's
 * no delay once Isaac starts.
 */
export function Explainer({ data }: { data: ExplainerExperience }) {
  const idx = useClunoid((s) => s.explainerIndex);
  const beats = data.beats;

  // Preload every beat's media up front → smooth, delay-free playback.
  useEffect(() => {
    for (const b of beats) {
      const e = b.entity;
      if (!e) continue;
      if (e.imageUrl) new Image().src = e.imageUrl;
      if (e.poster) new Image().src = e.poster;
    }
  }, [beats]);

  const shown: ExplainerEntity[] = [];
  for (let i = 0; i <= idx && i < beats.length; i++) {
    if (beats[i].entity) shown.push(beats[i].entity as ExplainerEntity);
  }
  const current = shown[shown.length - 1];

  // Clicking a thumbnail makes it the main view; a new beat clears the choice
  // so the media keeps following the narration.
  const [picked, setPicked] = useState<ExplainerEntity | null>(null);
  useEffect(() => setPicked(null), [idx]);
  const main = picked ?? current;
  const others = shown.filter((e) => e !== main);

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex w-full flex-col gap-6 lg:flex-row lg:items-start lg:gap-10">
      {/* LEFT — synced media */}
      <div className="flex w-full shrink-0 flex-col items-center gap-4 lg:sticky lg:top-2 lg:w-[44%]">
        <AnimatePresence mode="popLayout">
          {main && (
            <motion.div
              key={main.videoUrl || main.imageUrl || main.name}
              initial={{ opacity: 0, scale: 0.92, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -10 }}
              transition={{ type: "spring", stiffness: 220, damping: 24 }}
              className="group relative overflow-hidden rounded-2xl border border-clay/40 bg-surface/60 shadow-glow"
            >
              <Media entity={main} className="max-h-[52vh] w-auto max-w-full object-contain" big />
              {(main.videoUrl || main.imageUrl) && (
                <button
                  type="button"
                  onClick={() => downloadMedia((main.videoUrl || main.imageUrl) as string)}
                  title="Download"
                  aria-label="Download media"
                  className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full bg-black/45 text-white opacity-0 backdrop-blur transition hover:bg-black/70 group-hover:opacity-100"
                >
                  <Download size={16} />
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {others.length > 0 && (
          <LayoutGroup>
            <div className="flex flex-wrap justify-center gap-2">
              {others.map((e, i) => (
                <Thumb key={`${e.name}-${i}`} entity={e} onClick={() => setPicked(e)} />
              ))}
            </div>
          </LayoutGroup>
        )}
      </div>

      {/* RIGHT — the info card with the full explanation */}
      <motion.div layout className="w-full flex-1 rounded-2xl border border-border bg-surface/90 p-6 backdrop-blur sm:p-7">
        {data.title && <h2 className="mb-4 font-serif text-2xl text-ink sm:text-3xl">{data.title}</h2>}
        <div className="flex flex-col gap-3 text-[15px] leading-relaxed sm:text-base">
          {beats.map((b, i) => (
            <p
              key={i}
              className="transition-colors duration-300"
              style={{ color: i === idx ? "var(--ink,#F4F2EC)" : i < idx ? "rgba(244,242,236,0.65)" : "rgba(244,242,236,0.4)" }}
            >
              {b.say}
            </p>
          ))}
        </div>
      </motion.div>
      </div>

      {/* FULL-WIDTH sectioned data summary beneath the media + script (not narrated) */}
      {data.summary && data.summary.length > 0 && <SummaryCard sections={data.summary} />}

      {/* Clickable related follow-ups at the bottom (continue the conversation) */}
      {data.suggestions && data.suggestions.length > 0 && <Suggestions items={data.suggestions} />}
    </div>
  );
}

const SECTION_COLORS = ["#E0937A", "#7FB5FF", "#7FB069", "#D97757", "#B3D4FF", "#D4B25A"];

/**
 * Full-width, sectioned "data summary" beneath the media + script — a modern,
 * Wikipedia-style infobox: each section has a COLORED heading and clean data
 * rows. Isaac never narrates this; it's extra reference for the reader.
 */
function SummaryCard({ sections }: { sections: SummarySection[] }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full rounded-2xl border border-border bg-surface/90 p-5 backdrop-blur sm:p-6"
    >
      <div className="mb-5 flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-gradient-to-br from-clay to-spark" />
        <h3 className="font-serif text-lg text-ink sm:text-xl">At a glance</h3>
      </div>
      <div className="grid gap-x-10 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((sec, i) => {
          const c = SECTION_COLORS[i % SECTION_COLORS.length];
          return (
            <div key={i} className="min-w-0">
              <h4
                className="mb-2.5 border-b pb-1.5 text-xs font-semibold uppercase tracking-wider"
                style={{ color: c, borderColor: `${c}55` }}
              >
                {sec.heading}
              </h4>
              <dl className="flex flex-col gap-2">
                {sec.items.map((it, j) => (
                  <div key={j} className="flex items-baseline justify-between gap-4 text-sm">
                    <dt className="shrink-0 text-ink-faint">{it.label}</dt>
                    <dd className="min-w-0 break-words text-right font-medium text-ink">{it.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

/** Clickable related follow-up prompts — like the suggestions at the end of a
 *  chat. Tapping one sends it as the next question (continuing the conversation). */
function Suggestions({ items }: { items: string[] }) {
  return (
    <div className="w-full">
      <div className="mb-2.5 text-xs font-medium uppercase tracking-wider text-ink-faint">Keep exploring</div>
      <div className="flex flex-wrap gap-2">
        {items.map((s, i) => (
          <button
            key={i}
            type="button"
            onClick={() => useClunoid.getState().send(s)}
            className="rounded-full border border-border bg-surface/70 px-4 py-2 text-sm text-ink-muted transition hover:border-clay hover:bg-surface-2 hover:text-ink"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function Thumb({ entity, onClick }: { entity: ExplainerEntity; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      layout
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className="group relative"
      title="Show this"
    >
      <div className="overflow-hidden rounded-xl border border-border bg-surface/60 transition hover:border-clay/60">
        <Media entity={entity} className="h-14 w-20 object-contain" />
      </div>
      <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-56 -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-soft group-hover:block">
        <Media entity={entity} className="max-h-48 w-full object-contain" />
      </div>
    </motion.button>
  );
}

/**
 * Renders the entity's video (preferred) or image, full size and uncropped.
 * If a media URL fails to load, it's hidden — never replaced with initials.
 */
function Media({ entity, className, big }: { entity: ExplainerEntity; className: string; big?: boolean }) {
  const [failed, setFailed] = useState(false);

  // In the timeline (small) we show the poster/image, not an autoplaying video.
  const useVideo = big && !!entity.videoUrl;
  const imgSrc = useVideo ? undefined : entity.videoUrl ? entity.poster : entity.imageUrl;

  if (failed) return null;

  if (useVideo) {
    return (
      <video
        src={entity.videoUrl}
        poster={entity.poster}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        onError={() => setFailed(true)}
        className={className}
      />
    );
  }
  if (!imgSrc) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={imgSrc} alt="" draggable={false} onError={() => setFailed(true)} className={className} />
  );
}
