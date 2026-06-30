"use client";

/**
 * Persistent "remove watermark" preference for Pro/Max users.
 *
 * Stores the user's INTENT only (a single boolean, survives refresh via localStorage,
 * shared across game + stat video creation). The actual EFFECT is plan-gated at the
 * consumer (ShareModal): the watermark is removed only while the user is currently a
 * pro/max subscriber, so a downgrade re-shows it. Off by default → branded videos.
 * Mirrors the lib/voice/preference.ts pattern (SSR-safe, best-effort writes).
 */
const KEY = "clunoid_remove_watermark";

function read(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(KEY) === "1";
  } catch {
    return false; // SSR / storage blocked → watermark stays (fail-closed)
  }
}

let removeWatermark = read();

export function getRemoveWatermark(): boolean {
  return removeWatermark;
}

export function setRemoveWatermark(v: boolean): void {
  removeWatermark = v;
  try {
    localStorage.setItem(KEY, v ? "1" : "0");
  } catch {
    /* best effort — never block on storage */
  }
}
