"use client";

/**
 * Client → planner bridge for Motion Graphics. Mirrors the other features:
 * a read-only PREFLIGHT before the expensive Opus call, then the real plan.
 */
import { reportBillingStatus, refreshCredits } from "@/lib/billing/bus";
import type { MotionSpec } from "./spec";

export type GraphicsGateReason = "auth" | "plan" | "credits" | "failed";

/** Read-only verify (no charge, no Opus): auth + plan/credits access + affordability. */
export async function preflightGraphics(request: string, durationSec = 0): Promise<{ ok: boolean; reason?: GraphicsGateReason }> {
  let res: Response;
  try {
    res = await fetch("/api/graphics/plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ request, durationSec, preflight: true }),
    });
  } catch {
    return { ok: true }; // transient — the gated call still verifies
  }
  if (res.ok) return { ok: true };
  if (res.status === 401) return { ok: false, reason: "auth" };
  if (res.status === 402) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, reason: j.error === "plan" ? "plan" : "credits" };
  }
  return { ok: true };
}

/** A fresh, randomized batch of AI video ideas for the "Suggest an idea" button.
 *  Free (Groq) and best-effort — returns [] on any failure so the caller can fall
 *  back to its own seed list. */
export async function suggestGraphicsIdeas(): Promise<string[]> {
  try {
    const res = await fetch("/api/graphics/suggest", { method: "POST", headers: { "content-type": "application/json" } });
    if (!res.ok) return [];
    const d = (await res.json()) as { ideas?: string[] };
    if (!Array.isArray(d.ideas)) return [];
    return d.ideas.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.trim());
  } catch {
    return [];
  }
}

export type GraphicsPlanResult = { ok: true; spec: MotionSpec } | { ok: false; reason: GraphicsGateReason };

export async function planGraphics(request: string, durationSec = 0): Promise<GraphicsPlanResult> {
  let res: Response;
  try {
    res = await fetch("/api/graphics/plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ request, durationSec }),
    });
  } catch {
    return { ok: false, reason: "failed" };
  }
  if (res.status === 401) return { ok: false, reason: "auth" };
  if (res.status === 402) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, reason: j.error === "plan" ? "plan" : "credits" };
  }
  if (res.status === 429) {
    reportBillingStatus(429);
    return { ok: false, reason: "failed" };
  }
  if (!res.ok) return { ok: false, reason: "failed" };
  let data: { spec?: MotionSpec; error?: boolean };
  try {
    data = (await res.json()) as { spec?: MotionSpec; error?: boolean };
  } catch {
    return { ok: false, reason: "failed" };
  }
  if (data.error || !data.spec?.scenes?.length) return { ok: false, reason: "failed" };
  refreshCredits();
  return { ok: true, spec: data.spec };
}
