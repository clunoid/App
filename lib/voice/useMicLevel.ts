"use client";

import { useEffect, useRef } from "react";

/**
 * Opens a mic stream and reports live input level (0..1) via `onLevel` so the
 * Stage can animate while the *user* speaks — without re-rendering React each
 * frame. Active only while `enabled`; releases the mic when disabled.
 */
export function useMicLevel(enabled: boolean, onLevel: (v: number) => void) {
  const raf = useRef(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cb = useRef(onLevel);
  cb.current = onLevel;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx();
        ctxRef.current = ctx;
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          analyser.getByteFrequencyData(data);
          let sum = 0;
          for (const v of data) sum += v;
          cb.current(Math.min(1, (sum / data.length / 255) * 2.2));
          raf.current = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        /* mic denied — listening viz just stays calm */
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf.current);
      ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      cb.current(0);
    };
  }, [enabled]);
}
