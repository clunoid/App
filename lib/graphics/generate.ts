"use client";

/**
 * Client → planner bridge for Motion Graphics. Mirrors the other features:
 * a read-only PREFLIGHT before the expensive Opus call, then the real plan.
 */
import { reportBillingStatus, refreshCredits } from "@/lib/billing/bus";
import type { MotionSpec } from "./spec";

export type GraphicsGateReason = "auth" | "plan" | "credits" | "failed";

/** Read-only verify (no charge, no Opus): auth + plan/credits access + affordability. */
export async function preflightGraphics(request: string): Promise<{ ok: boolean; reason?: GraphicsGateReason }> {
  let res: Response;
  try {
    res = await fetch("/api/graphics/plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ request, preflight: true }),
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

export type GraphicsPlanResult = { ok: true; spec: MotionSpec } | { ok: false; reason: GraphicsGateReason };

export async function planGraphics(request: string): Promise<GraphicsPlanResult> {
  let res: Response;
  try {
    res = await fetch("/api/graphics/plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ request }),
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
