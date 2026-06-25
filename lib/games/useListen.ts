"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* Minimal typings for the Web Speech API (not in lib.dom for all targets). */
type SpeechRecognitionResultLike = { 0: { transcript: string }; isFinal: boolean };
type SpeechRecognitionEventLike = { resultIndex: number; results: ArrayLike<SpeechRecognitionResultLike> };
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type RecCtor = new () => SpeechRecognitionLike;

function getCtor(): RecCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/**
 * Continuous microphone listening for voice answers. The caller toggles `active`
 * (true during the answering window); the latest interim+final transcript is
 * reported via onResult, and `final` accumulates the locked-in spoken answer.
 */
export function useListen(onResult: (text: string) => void) {
  const [supported] = useState<boolean>(() => !!getCtor());
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef("");
  const finalsRef = useRef<string[]>([]); // committed final segments BY result index (idempotent — no double-append)
  const wantOnRef = useRef(false);
  const runningRef = useRef(false); // true between onstart and onend — prevents double-start
  const gotFinalRef = useRef(false); // a final answer was captured this round → stop re-arming (no mic re-trigger / re-capture)
  const deniedRef = useRef(false); // mic blocked / unavailable — stop retrying (no hot loop)
  const lastStartRef = useRef(0); // throttle: never start more than once per ~400ms
  const cbRef = useRef(onResult);
  cbRef.current = onResult;

  useEffect(() => {
    const Ctor = getCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onstart = () => {
      runningRef.current = true;
    };
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        // Assign each final result BY ITS INDEX — re-seeing the same result just
        // overwrites the same slot (idempotent), so one word can never be appended
        // twice ("ukraine ukraine"). Interim text isn't committed.
        if (r.isFinal) {
          finalsRef.current[i] = r[0].transcript;
          gotFinalRef.current = true;
        } else {
          interim += r[0].transcript;
        }
      }
      finalRef.current = finalsRef.current.filter(Boolean).join(" ").trim();
      cbRef.current((finalRef.current + " " + interim).trim());
    };
    // Re-arm ONLY when we still want to listen, nothing is already running, and
    // the mic hasn't been denied — THROTTLED to once per ~400ms. Together these
    // stop the rapid start→onend→start churn (the "double trigger"), including the
    // hot loop that happens when start() fails before onstart (e.g. mic blocked).
    const restart = () => {
      // gotFinalRef: once an answer is captured this round, do NOT re-open the mic
      // — that relaunch is the audible "triggered twice" sound and re-captures the
      // trailing word. We re-arm next round via start() (which clears the latch).
      if (!wantOnRef.current || runningRef.current || deniedRef.current || gotFinalRef.current) return;
      const wait = Math.max(0, 400 - (Date.now() - lastStartRef.current));
      setTimeout(() => {
        if (!wantOnRef.current || runningRef.current || deniedRef.current || gotFinalRef.current) return;
        lastStartRef.current = Date.now();
        try {
          rec.start();
        } catch {
          /* already started */
        }
      }, wait);
    };
    rec.onerror = (e) => {
      runningRef.current = false;
      const err = (e && e.error) || "";
      // Transient (silence/network/intentional stop) → throttled retry. Anything
      // else (not-allowed, service-not-allowed, audio-capture…) means the mic is
      // unavailable, so STOP retrying — retrying would spin a hot loop.
      if (err === "no-speech" || err === "network" || err === "aborted") {
        restart();
      } else {
        deniedRef.current = true;
        wantOnRef.current = false;
      }
    };
    rec.onend = () => {
      runningRef.current = false;
      restart();
    };
    recRef.current = rec;
    return () => {
      wantOnRef.current = false;
      runningRef.current = false;
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
      recRef.current = null;
    };
  }, []);

  const start = useCallback(() => {
    finalRef.current = "";
    finalsRef.current = [];
    gotFinalRef.current = false; // fresh round/arm — allow listening again
    wantOnRef.current = true;
    deniedRef.current = false; // explicit (re)enable clears any prior denial
    if (runningRef.current) return; // already listening — never stack a second session
    lastStartRef.current = Date.now();
    try {
      recRef.current?.start();
    } catch {
      /* already running */
    }
  }, []);

  const stop = useCallback(() => {
    wantOnRef.current = false;
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
  }, []);

  // Wipe the accumulated transcript (used to discard Isaac's voice / echo so only
  // the player's own words count).
  const reset = useCallback(() => {
    finalRef.current = "";
    finalsRef.current = [];
  }, []);

  return { supported, start, stop, reset };
}
