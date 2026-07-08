"use client";

/**
 * Edge video branding — persisted per device (localStorage), auto-saved on every
 * change so there is no save button. Defaults to Clunoid; a brand can replace the
 * name / call-to-action / logo with their own to promote their platform.
 */
import type { Branding } from "./video-types";

export const DEFAULT_BRANDING: Branding = {
  enabled: true,
  placement: "throughout",
  corner: "bottom",
  name: "clunoid.com",
  tagline: "Made on clunoid.com",
};

const KEY = "edge_branding_v1";

export function loadBranding(): Branding {
  if (typeof window === "undefined") return DEFAULT_BRANDING;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_BRANDING, ...(JSON.parse(raw) as Partial<Branding>) };
  } catch {
    /* corrupt / unavailable storage → defaults */
  }
  return DEFAULT_BRANDING;
}

export function saveBranding(b: Branding): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(b));
  } catch {
    /* ignore quota / private-mode errors */
  }
}
