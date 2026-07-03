"use client";

/**
 * LIVE PREVIEW of a designed motion-graphics video — powered by the Remotion
 * Player (remotion.dev; free for individuals and small teams), driving the SAME
 * deterministic canvas engine the exporter uses. Users watch and scrub the whole
 * piece — story, layouts, cutaways, footage posters, captions — BEFORE spending
 * credits on narration + the real render.
 *
 * Preview fidelity: timing is ESTIMATED from narration word counts (the real
 * render paces by the actual voice), captions use the same estimate, and footage
 * clips show their poster frame (the export draws the live clips). Everything
 * else — every scene, element, mention cutaway, transition — is the real engine.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Player } from "@remotion/player";
import { useCurrentFrame } from "remotion";
import { computeMotionTiming, drawMotionFrame, makePalette, resolveMotionFont, type MotionAssets, type MotionTiming, type Pal } from "@/lib/graphics/engine";
import type { MotionSpec, CaptionWord } from "@/lib/graphics/spec";
import type { ReelAspect } from "@/lib/share/reel";

const WPS = 2.35; // estimated spoken words/second (matches the planner's pacing math)

/** Estimated narration duration per scene → the same timing shape the export uses. */
function estimateTiming(spec: MotionSpec, branded: boolean): { timing: MotionTiming; words: CaptionWord[][] } {
  const fake = spec.scenes.map((s) => {
    const n = s.narration.split(/\s+/).filter(Boolean).length;
    return { duration: Math.max(1.2, n / WPS + 0.35) } as unknown as AudioBuffer;
  });
  const timing = computeMotionTiming(spec, fake, branded);
  const words = spec.scenes.map((s) => {
    const ws = s.narration.split(/\s+/).filter(Boolean);
    const per = 1 / WPS;
    return ws.map((text, i) => ({ text, start: 0.25 + i * per, end: 0.25 + (i + 1) * per }));
  });
  return { timing, words };
}

function useMedia(spec: MotionSpec): { images: Map<string, HTMLImageElement>; version: number } {
  const mapRef = useRef(new Map<string, HTMLImageElement>());
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let dead = false;
    const urls = new Set<string>();
    for (const s of spec.scenes) {
      for (const el of s.elements || []) if (el.imageUrl) urls.add(el.imageUrl);
      for (const m of s.mentions || []) if (m.imageUrl) urls.add(m.imageUrl);
    }
    mapRef.current = new Map();
    let pending = urls.size;
    if (!pending) return;
    for (const u of urls) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      const done = () => {
        if (dead) return;
        if (img.width) mapRef.current.set(u, img);
        if (--pending % 3 === 0 || pending === 0) setVersion((v) => v + 1); // repaint as media lands
      };
      img.onload = done;
      img.onerror = done;
      img.src = u;
    }
    return () => {
      dead = true;
    };
  }, [spec]);
  return { images: mapRef.current, version };
}

/** The Remotion composition: one canvas, redrawn from the engine per frame. */
function FrameView({ spec, timing, words, images, pal, W, H, version }: { spec: MotionSpec; timing: MotionTiming; words: CaptionWord[][]; images: Map<string, HTMLImageElement>; pal: Pal; W: number; H: number; version: number }) {
  const frame = useCurrentFrame();
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    resolveMotionFont();
    const assets: MotionAssets = { images, videos: new Map(), captionWords: words };
    try {
      drawMotionFrame(ctx, W, H, spec, timing, assets, pal, Math.min(frame / 30, timing.total - 0.001), true);
    } catch {
      /* a bad frame must never crash the preview */
    }
  }, [frame, spec, timing, words, images, pal, W, H, version]);
  return <canvas ref={ref} width={W} height={H} style={{ width: "100%", height: "100%" }} />;
}

export function MotionPreview({ spec, aspect }: { spec: MotionSpec; aspect: ReelAspect }) {
  // preview composition at half resolution — smooth scrubbing, identical geometry
  const W = aspect === "9:16" ? 540 : 960;
  const H = aspect === "9:16" ? 960 : 540;
  const { timing, words } = useMemo(() => estimateTiming(spec, true), [spec]);
  const pal = useMemo(() => makePalette(spec), [spec]);
  const { images, version } = useMedia(spec);

  return (
    <Player
      component={FrameView as never}
      inputProps={{ spec, timing, words, images, pal, W, H, version }}
      durationInFrames={Math.max(30, Math.ceil(timing.total * 30))}
      fps={30}
      compositionWidth={W}
      compositionHeight={H}
      controls
      loop
      clickToPlay
      style={{ width: "100%", borderRadius: 14, overflow: "hidden", background: "#0a0a12" }}
      acknowledgeRemotionLicense
    />
  );
}
