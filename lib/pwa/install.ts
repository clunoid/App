"use client";

/**
 * INSTALL — one source of truth for "can this be installed, and how".
 *
 * `beforeinstallprompt` fires ONCE per page load and the event it hands over is
 * single-use. Two components each keeping their own copy is how you end up
 * calling prompt() on a spent event, so the event lives here, in one module,
 * and every component reads the same store. Dismissing in one place hides it
 * everywhere for the same reason.
 *
 * Three worlds, and the difference matters:
 *
 *   "prompt"  Chromium fired the event. A click really installs.
 *   "ios"     iOS and iPadOS. No event exists and none is coming — installing
 *             is Share → Add to Home Screen, so all we can do is say so.
 *   "none"    Firefox desktop and anything else. No install path at all, so
 *             nothing should be offered. A button that cannot work is worse
 *             than no button.
 */

const SNOOZE_KEY = "cln_install_snoozed";
const SNOOZE_DAYS = 30;

export type InstallMode = "prompt" | "ios" | "none";

/** The Chromium event. Not in lib.dom, so it is spelled out. */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type State = { mode: InstallMode; ready: boolean };

let state: State = { mode: "none", ready: false };
let deferred: InstallPromptEvent | null = null;
let started = false;

const listeners = new Set<(s: State) => void>();

function emit() {
  const snapshot = state;
  listeners.forEach((fn) => fn(snapshot));
}

function set(next: Partial<State>) {
  state = { ...state, ...next };
  emit();
}

export function snoozed(): boolean {
  try {
    const until = Number(localStorage.getItem(SNOOZE_KEY) || 0);
    return Number.isFinite(until) && Date.now() < until;
  } catch {
    return false;
  }
}

export function snooze() {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 86400_000));
  } catch { /* private mode: this visit only */ }
  set({ mode: "none", ready: true });
}

/** Inside an installed window there is nothing left to offer. */
export function alreadyInstalled(): boolean {
  if (typeof window === "undefined") return false;
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return !!standalone || iosStandalone;
}

export function isApple(): boolean {
  if (typeof navigator === "undefined") return false;
  // iPadOS 13+ reports itself as a Mac, so the touch count is what catches it.
  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const iPadDesktopUA = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return iOS || iPadDesktopUA;
}

/** Wired once per page, however many components are watching. */
function start() {
  if (started || typeof window === "undefined") return;
  started = true;

  if (alreadyInstalled() || snoozed()) {
    set({ mode: "none", ready: true });
    return;
  }

  if (isApple()) {
    set({ mode: "ios", ready: true });
    return;
  }

  // Not iOS and no event yet: assume nothing is on offer until one arrives.
  set({ mode: "none", ready: true });

  window.addEventListener("beforeinstallprompt", (e: Event) => {
    // Without this Chrome shows its own mini-infobar instead of letting us
    // choose the moment.
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    set({ mode: "prompt", ready: true });
  });

  window.addEventListener("appinstalled", () => {
    deferred = null;
    set({ mode: "none", ready: true });
  });
}

export function subscribe(fn: (s: State) => void): () => void {
  start();
  listeners.add(fn);
  fn(state);
  return () => { listeners.delete(fn); };
}

export function getState(): State {
  return state;
}

/**
 * Fire the real prompt. Returns what the person chose, or null when there was
 * nothing to fire — iOS, or an event already spent.
 */
export async function promptInstall(): Promise<"accepted" | "dismissed" | null> {
  if (!deferred) return null;
  const e = deferred;
  deferred = null;                       // single-use, whatever happens next
  await e.prompt();
  const { outcome } = await e.userChoice;
  if (outcome === "accepted") set({ mode: "none", ready: true });
  else snooze();
  return outcome;
}
