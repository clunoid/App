"use client";

import { motion } from "framer-motion";
import type { RichCardExperience } from "@/lib/brain/scene";

/**
 * Info experience: the picture is its OWN panel beside the text, shown at full
 * size (uncropped) — image on one side, the facts on the other. Stacks on
 * phones, side-by-side on wider screens. Uses the full available width.
 */
export function RichCard({ data }: { data: RichCardExperience }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex w-full flex-col items-stretch gap-5 lg:flex-row lg:items-start"
    >
      {data.imageUrl && (
        <div className="flex shrink-0 justify-center lg:w-[44%]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data.imageUrl}
            alt={data.title ?? "illustration"}
            className="max-h-[55vh] w-auto max-w-full rounded-2xl object-contain shadow-soft"
            draggable={false}
          />
        </div>
      )}

      <div className="flex-1 rounded-2xl border border-border bg-surface/90 p-6 backdrop-blur">
        {data.title && <h2 className="mb-3 font-serif text-2xl text-ink sm:text-3xl">{data.title}</h2>}
        {data.body && <p className="leading-relaxed text-ink-muted sm:text-lg">{data.body}</p>}
        {data.bullets && data.bullets.length > 0 && (
          <ul className="mt-4 flex flex-col gap-2">
            {data.bullets.map((b, i) => (
              <li key={i} className="flex gap-2 text-ink-muted">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-clay" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </motion.div>
  );
}
