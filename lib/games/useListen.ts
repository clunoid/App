"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* Minimal typings for the Web Speech API (not in lib.dom for all targets). */
type SpeechRecognitionResultLike = { 0: { transcript: string }; isFinal: boolean };
type SpeechRecognitionEventLike = { resultIndex: number; results: ArrayLike<SpeechRecognitionResultLike> };
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
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
  const wantOnRef = useRef(false);
  const cbRef = useRef(onResult);
  cbRef.current = onResult;

  useEffect(() => {
    const Ctor = getCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalRef.current = (finalRef.current + " " + r[0].transcript).trim();
        else interim += r[0].transcript;
      }
      cbRef.current((finalRef.current + " " + interim).trim());
    };
    const restart = () => {
      if (!wantOnRef.current) return;
      try {
        rec.start();
      } catch {
        /* already started */
      }
    };
    // Recover from transient errors (no-speech, network…) AND normal auto-stops,
    // so the mic keeps listening for the whole answering window.
    rec.onerror = () => setTimeout(restart, 250);
    rec.onend = () => restart();
    recRef.current = rec;
    return () => {
      wantOnRef.current = false;
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
    wantOnRef.current = true;
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
  }, []);

  return { supported, start, stop, reset };
}
