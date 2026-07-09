"use client";

/**
 * The Showtime ASSET LAYER — plays the curated professional Lottie animations over
 * the clean stage. Each gift runs its tier's choreographed SHOW: a timeline of cues,
 * each firing a full-screen play-once Lottie burst at a set moment, varied in asset /
 * scale / side so the stage stays alive and evolving for the whole show (up to ~32s
 * for legendary) rather than a single quick pop. Instances fade out and tear down when
 * done; concurrent plays stack up to MAX_CONCURRENT so overlapping bursts and rapid
 * combos build. All animation JSON is preloaded once so playback never hitches.
 *
 * Built for a 24/7 OBS stage, so lifecycle is strict: every instance owns its timers
 * and is torn down exactly once (on natural end, on fade, or when retired at the cap);
 * animation data is pooled per-asset so steady-state playback allocates ~nothing.
 * `onBusyChange` reports whether anything is playing so the stage can hold back its
 * idle prompt during a long show.
 *
 * This replaces the old code-generated particle engine: the quality comes from the
 * assets (made by motion designers); our job is the choreography around them.
 */
import { useEffect, useRef } from "react";
import type { AnimationItem } from "lottie-web";
import type { ShowtimeBus } from "@/lib/showtime/bus";
import { ALL_SRCS, showForGift, type Cue } from "@/lib/showtime/assets";
import type { GiftEvent } from "@/lib/showtime/types";

const MAX_CONCURRENT = 8; // ≥ legendary's own peak (6) + overlap headroom, bounds full-screen overdraw
const FADE_MS = 500;
const POOL_CAP = 8; // spare animationData objects kept per asset for reuse

type Instance = { el: HTMLElement; src: string; data: unknown; endT?: ReturnType<typeof setTimeout>; done: boolean };

export function AssetLayer({ bus, onBusyChange }: { bus: ShowtimeBus | null; onBusyChange?: (busy: boolean) => void }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const lottieRef = useRef<typeof import("lottie-web").default | null>(null);
  const textRef = useRef<Record<string, string>>({}); // raw JSON text per asset
  const poolRef = useRef<Record<string, unknown[]>>({}); // reusable parsed data per asset
  const active = useRef<Map<AnimationItem, Instance>>(new Map());
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const busyRef = useRef(false);
  const onBusyRef = useRef(onBusyChange);
  onBusyRef.current = onBusyChange;

  const reportBusy = () => {
    const busy = active.current.size > 0;
    if (busy !== busyRef.current) { busyRef.current = busy; onBusyRef.current?.(busy); }
  };

  // Load the player + preload every animation's JSON text once (client-only; keeps
  // lottie-web out of the server bundle and playback instant).
  useEffect(() => {
    let alive = true;
    const activeMap = active.current;
    const timerSet = timers.current;
    (async () => {
      const mod = await import("lottie-web");
      if (!alive) return;
      lottieRef.current = mod.default;
      await Promise.all(
        ALL_SRCS.map(async (src) => {
          try {
            const r = await fetch(src);
            const t = await r.text();
            if (alive) textRef.current[src] = t;
          } catch {
            /* asset missing — cues for it simply won't play until it's added */
          }
        }),
      );
    })();
    return () => {
      alive = false;
      timerSet.forEach((t) => clearTimeout(t));
      timerSet.clear();
      activeMap.forEach((inst, anim) => { try { anim.destroy(); } catch { /* already gone */ } inst.el.remove(); });
      activeMap.clear();
    };
  }, []);

  useEffect(() => {
    if (!bus) return;

    // A fresh animationData object for `src` — reused from the pool, else parsed once.
    // (lottie-web mutates animationData with asset-intrinsic caches, so a used-then-freed
    //  copy is safe to hand to a later instance of the same asset.)
    const takeData = (src: string): unknown => {
      const spare = poolRef.current[src];
      if (spare && spare.length) return spare.pop();
      const text = textRef.current[src];
      return text ? JSON.parse(text) : null;
    };
    const giveData = (src: string, data: unknown) => {
      const spare = (poolRef.current[src] ||= []);
      if (spare.length < POOL_CAP) spare.push(data);
    };

    // Immediate teardown (retire-at-cap, unmount, and end-of-fade all route here).
    const hardRemove = (anim: AnimationItem) => {
      const inst = active.current.get(anim);
      if (!inst) return;
      if (inst.endT) { clearTimeout(inst.endT); timers.current.delete(inst.endT); }
      try { anim.destroy(); } catch { /* already gone */ }
      inst.el.remove();
      giveData(inst.src, inst.data);
      active.current.delete(anim);
      reportBusy();
    };

    const playCue = (cue: Cue) => {
      const lottie = lottieRef.current;
      const root = rootRef.current;
      if (!lottie || !root) return;
      const data = takeData(cue.src);
      if (!data) return;

      // cap concurrency — retire the oldest so the newest burst always plays
      if (active.current.size >= MAX_CONCURRENT) {
        const oldest = active.current.keys().next().value;
        if (oldest) hardRemove(oldest);
      }

      const el = document.createElement("div");
      const tf: string[] = [];
      if (cue.x) tf.push(`translateX(${cue.x * 100}%)`);
      if (cue.scale && cue.scale !== 1) tf.push(`scale(${cue.scale})`);
      el.style.cssText = `position:absolute;inset:0;pointer-events:none;transition:opacity ${FADE_MS}ms ease-out;${tf.length ? `transform:${tf.join(" ")};` : ""}`;
      root.appendChild(el);

      const anim = lottie.loadAnimation({
        container: el,
        // canvas renderer: one <canvas> instead of thousands of live SVG nodes — stays
        // 60fps even when several bursts overlap in a legendary show.
        renderer: "canvas",
        loop: false,
        autoplay: true,
        animationData: data,
        rendererSettings: {
          preserveAspectRatio: cue.fit === "cover" ? "xMidYMid slice" : "xMidYMid meet",
          clearCanvas: true,
        },
      });
      if (cue.speed && cue.speed !== 1) anim.setSpeed(cue.speed);
      const inst: Instance = { el, src: cue.src, data, done: false };
      active.current.set(anim, inst);
      reportBusy();

      // Graceful end: fade, then hard-remove. Idempotent; also cancels the end timer.
      const finish = () => {
        const e = active.current.get(anim);
        if (!e || e.done) return;
        e.done = true;
        if (e.endT) { clearTimeout(e.endT); timers.current.delete(e.endT); e.endT = undefined; }
        e.el.style.opacity = "0";
        const ft = setTimeout(() => { timers.current.delete(ft); hardRemove(anim); }, FADE_MS);
        timers.current.add(ft);
      };

      // Fade at `hold`, else on natural completion (+ a safety backstop so nothing leaks).
      const life = cue.hold ?? (anim.getDuration() * 1000) / (cue.speed || 1) + 1500;
      if (!cue.hold) anim.addEventListener("complete", finish);
      const endT = setTimeout(finish, Number.isFinite(life) && life > 0 ? life : 8000);
      inst.endT = endT;
      timers.current.add(endT);
    };

    return bus.onGift((ev: GiftEvent) => {
      for (const cue of showForGift(ev.gift).cues) {
        const t = setTimeout(() => { timers.current.delete(t); playCue(cue); }, cue.at);
        timers.current.add(t);
      }
    });
  }, [bus]);

  return <div ref={rootRef} className="pointer-events-none absolute inset-0 overflow-hidden" />;
}
