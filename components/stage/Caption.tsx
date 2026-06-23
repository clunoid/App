"use client";

import { useMemo } from "react";
import { useClunoid } from "@/lib/store/useClunoid";

const WINDOW = 8; // how many recent words to show while speaking

/**
 * Isaac's speech captions, revealed a few words at a time IN SYNC with his
 * voice (like social-media captions) using the live character timings. Shows
 * the user's words while they speak, and the full line once Isaac has finished.
 */
export function Caption({ interim }: { interim?: string }) {
  const caption = useClunoid((s) => s.caption);
  const spoken = useClunoid((s) => s.spokenChars);
  const isaac = useClunoid((s) => s.isaac);

  const words = useMemo(() => {
    const out: { text: string; start: number }[] = [];
    let offset = 0;
    for (const part of caption.split(/(\s+)/)) {
      if (part.trim()) out.push({ text: part, start: offset });
      offset += part.length;
    }
    return out;
  }, [caption]);

  const speaking = isaac === "speaking";

  // While the user is talking (and Isaac isn't), show their live words.
  if (interim && !speaking) {
    return (
      <p className="text-center text-lg font-light italic text-ink-faint sm:text-xl">
        {interim}
      </p>
    );
  }
  if (!caption) return null;

  // While Isaac speaks: a sliding window of recently-spoken words, in sync.
  if (speaking && spoken > 0) {
    const count = words.filter((w) => w.start < spoken).length;
    const win = words.slice(Math.max(0, count - WINDOW), count);
    return (
      <p
        className="text-center text-2xl font-medium tracking-tight text-ink sm:text-3xl md:text-4xl"
        style={{ textShadow: "0 2px 18px rgba(0,0,0,0.55)" }}
      >
        {win.map((w, i) => (
          <span key={count - win.length + i} className={i === win.length - 1 ? "text-clay-soft" : "text-ink/75"}>
            {w.text}{" "}
          </span>
        ))}
      </p>
    );
  }

  // Otherwise nothing — captions appear only as someone is actually talking,
  // keeping the full screen clear for cards and images.
  return null;
}
