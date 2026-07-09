"use client";

/**
 * The Showtime ASSET LAYER — plays the curated professional Lottie animations over
 * the clean stage. Each gift triggers its tier "show": one or more full-screen,
 * play-once Lottie instances (see the asset registry), choreographed with delays so
 * legendary gifts layer confetti + popper + streamers + hearts into one big moment.
 * Instances fade out and tear down on complete; concurrent plays stack up to
 * MAX_CONCURRENT so rapid combos build. All animation JSON is preloaded once so
 * playback never hitches.
 *
 * This replaces the old code-generated particle engine: the quality now comes from
 * the assets (made by motion designers); our job is the choreography around them —
 * queueing, tier shows, and clean teardown.
 */
import { useEffect, useRef } from "react";
import type { AnimationItem } from "lottie-web";
import type { ShowtimeBus } from "@/lib/showtime/bus";
import { ALL_SRCS, showForGift, type AssetPlay } from "@/lib/showtime/assets";
import type { GiftEvent } from "@/lib/showtime/types";

const MAX_CONCURRENT = 8;
const FADE_MS = 460;

export function AssetLayer({ bus }: { bus: ShowtimeBus | null }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const lottieRef = useRef<typeof import("lottie-web").default | null>(null);
  const dataRef = useRef<Record<string, unknown>>({});
  const active = useRef<Map<AnimationItem, HTMLElement>>(new Map());

  // Load the player + preload every animation JSON once (client-only; keeps lottie-web
  // out of the server bundle and playback instant).
  useEffect(() => {
    let alive = true;
    const activeMap = active.current;
    (async () => {
      const mod = await import("lottie-web");
      if (!alive) return;
      lottieRef.current = mod.default;
      await Promise.all(
        ALL_SRCS.map(async (src) => {
          try {
            const r = await fetch(src);
            const d = await r.json();
            if (alive) dataRef.current[src] = d;
          } catch {
            /* asset missing — that show simply won't play until it's added */
          }
        }),
      );
    })();
    return () => {
      alive = false;
      activeMap.forEach((el, anim) => { anim.destroy(); el.remove(); });
      activeMap.clear();
    };
  }, []);

  useEffect(() => {
    if (!bus) return;

    const playOne = (spec: AssetPlay) => {
      const lottie = lottieRef.current;
      const root = rootRef.current;
      const data = dataRef.current[spec.src];
      if (!lottie || !root || !data) return;

      // cap concurrency — retire the oldest so the newest gift always plays
      if (active.current.size >= MAX_CONCURRENT) {
        const oldest = active.current.keys().next().value;
        if (oldest) {
          const el = active.current.get(oldest);
          active.current.delete(oldest);
          oldest.destroy();
          el?.remove();
        }
      }

      const el = document.createElement("div");
      el.style.cssText = `position:absolute;inset:0;pointer-events:none;transition:opacity ${FADE_MS}ms ease-out;${spec.scale && spec.scale !== 1 ? `transform:scale(${spec.scale});` : ""}`;
      root.appendChild(el);

      const anim = lottie.loadAnimation({
        container: el,
        // canvas renderer: one <canvas> instead of thousands of live SVG nodes — stays
        // 60fps even when several assets layer for a legendary show.
        renderer: "canvas",
        loop: false,
        autoplay: true,
        animationData: structuredClone(data),
        rendererSettings: {
          preserveAspectRatio: spec.fit === "cover" ? "xMidYMid slice" : "xMidYMid meet",
          clearCanvas: true,
        },
      });
      active.current.set(anim, el);

      anim.addEventListener("complete", () => {
        el.style.opacity = "0";
        window.setTimeout(() => {
          anim.destroy();
          el.remove();
          active.current.delete(anim);
        }, FADE_MS);
      });
    };

    return bus.onGift((ev: GiftEvent) => {
      for (const spec of showForGift(ev.gift)) {
        if (spec.delay) window.setTimeout(() => playOne(spec), spec.delay);
        else playOne(spec);
      }
    });
  }, [bus]);

  return <div ref={rootRef} className="pointer-events-none absolute inset-0 overflow-hidden" />;
}
