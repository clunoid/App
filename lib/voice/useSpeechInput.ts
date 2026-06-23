"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Continuous, resilient speech input. Once enabled it STAYS listening — it
 * auto-restarts on end/error and a watchdog re-arms it if it ever stalls, so
 * the user never has to refresh to be heard again. Callers decide whether to
 * act on a result (e.g. ignore while Isaac is speaking, to avoid echo).
 */
type SR = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SREvent) => void) | null;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};
type SREvent = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

function getCtor(): (new () => SR) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SR;
    webkitSpeechRecognition?: new () => SR;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useSpeechInput(opts: {
  onFinal: (t: string) => void;
  onInterim?: (t: string) => void;
}) {
  const { onFinal, onInterim } = opts;
  const [live, setLive] = useState(false);
  const [supported, setSupported] = useState(true);
  const recRef = useRef<SR | null>(null);
  const liveRef = useRef(false);
  const runningRef = useRef(false);
  const emittedRef = useRef(-1);

  const onFinalRef = useRef(onFinal);
  const onInterimRef = useRef(onInterim);
  onFinalRef.current = onFinal;
  onInterimRef.current = onInterim;

  const safeStart = useCallback(() => {
    if (!recRef.current || runningRef.current) return;
    try {
      recRef.current.start();
    } catch {
      /* already starting — ignore */
    }
  }, []);

  useEffect(() => {
    const Ctor = getCtor();
    if (!Ctor) {
      setSupported(false);
      return;
    }
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
        if (r.isFinal) {
          if (i > emittedRef.current) {
            emittedRef.current = i;
            const final = r[0].transcript.trim();
            if (final) onFinalRef.current(final);
          }
        } else {
          interim += r[0].transcript;
        }
      }
      if (interim) onInterimRef.current?.(interim);
    };
    const rearm = () => {
      runningRef.current = false;
      if (liveRef.current) setTimeout(safeStart, 250);
    };
    rec.onend = rearm;
    rec.onerror = (e) => {
      runningRef.current = false;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        liveRef.current = false;
        setLive(false);
        setSupported(false);
      } else if (liveRef.current) {
        setTimeout(safeStart, 400); // no-speech / aborted / network → keep trying
      }
    };
    recRef.current = rec;

    // Watchdog: if we should be listening but aren't, re-arm.
    const watchdog = setInterval(() => {
      if (liveRef.current && !runningRef.current) safeStart();
    }, 4000);

    return () => {
      clearInterval(watchdog);
      liveRef.current = false;
      rec.abort();
    };
  }, [safeStart]);

  const enable = useCallback(() => {
    liveRef.current = true;
    setLive(true);
    emittedRef.current = -1;
    safeStart();
  }, [safeStart]);

  const disable = useCallback(() => {
    liveRef.current = false;
    setLive(false);
    runningRef.current = false;
    emittedRef.current = -1; // drop any buffered (echo) results
    recRef.current?.abort(); // abort discards pending audio; stop() would finalize it
  }, []);

  return { live, supported, enable, disable };
}
