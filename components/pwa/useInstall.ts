"use client";

import { useEffect, useState } from "react";
import { subscribe, getState, type InstallMode } from "@/lib/pwa/install";

/**
 * Read the shared install store.
 *
 * `useSyncExternalStore` would do this too, but the store is deliberately
 * plain: it has to be readable from a module that is not a component (the
 * prompt itself), and a subscription is the smaller idea.
 *
 * Starts as "none" so nothing flashes during hydration — the server has no idea
 * what browser this is, and rendering an install card on the server only to
 * pull it a frame later is worse than showing it a moment late.
 */
export function useInstall(): { mode: InstallMode; ready: boolean } {
  const [s, setS] = useState<{ mode: InstallMode; ready: boolean }>({ mode: "none", ready: false });

  useEffect(() => {
    setS(getState());
    return subscribe(setS);
  }, []);

  return s;
}
