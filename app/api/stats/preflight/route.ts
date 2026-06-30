import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { creditsAvailable } from "@/lib/billing/meter";
import { ACTION_COSTS, INPUT_CAPS } from "@/lib/billing/costs";
import { guessIndicatorKey } from "@/lib/stats/indicators";

export const runtime = "nodejs";

type Kind = "generate" | "file" | "edit";

/**
 * Credits the matching POST route will actually need — computed DETERMINISTICALLY here
 * (no AI, no web search, no DB write), mirroring the real routes' own pricing:
 *   • generate: catalogue keyword (guessIndicatorKey) → cheap base (stats_plan); otherwise
 *     the custom build that WILL run Opus (stats_plan + stats_opus) — identical to
 *     app/api/stats/route.ts's pre-check.
 *   • file / edit: those routes always run Opus, charged upfront via gate() at the full
 *     stats_file / stats_edit cost.
 */
function requiredFor(kind: Kind, request: string): { required: number; willUseOpus: boolean } {
  if (kind === "file") return { required: ACTION_COSTS.stats_file, willUseOpus: true };
  if (kind === "edit") return { required: ACTION_COSTS.stats_edit, willUseOpus: true };
  const guess = guessIndicatorKey(request);
  return guess
    ? { required: ACTION_COSTS.stats_plan, willUseOpus: false }
    : { required: ACTION_COSTS.stats_plan + ACTION_COSTS.stats_opus, willUseOpus: true };
}

/**
 * READ-ONLY pre-flight for stat-battle generation. The client calls this BEFORE firing a
 * real request so we never even attempt an expensive Opus build for a user who isn't
 * authenticated or can't afford it. It performs NO charge and NO model/search call — the
 * binding spend gate stays the atomic consume_credits in the actual POST routes (this is
 * an advisory early-out + UX hook, never a grant of entitlement, so it cannot be a bypass).
 */
export async function POST(req: NextRequest) {
  let body: { request?: string; kind?: Kind } = {};
  try {
    body = await req.json();
  } catch {
    return new Response(null, { status: 400 });
  }

  // 1. AUTH — verified server-side from the request cookies (never trusts the client).
  const user = await requireUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth" }, { status: 401 });

  // 2. DETERMINISTIC required amount for the action they're about to run.
  const request = (body.request || "").trim().slice(0, INPUT_CAPS.statsRequest);
  const kind: Kind = body.kind === "file" || body.kind === "edit" ? body.kind : "generate";
  const { required, willUseOpus } = requiredFor(kind, request);

  // 3. READ the refill-aware balance (read-only) and compare. Lenient at the refill
  //    boundary exactly like app/api/stats/route.ts so a user about to refill is never
  //    false-blocked. `null` = somehow unauthenticated → treat as 0 (already 401'd above).
  const balance = await creditsAvailable();
  const have = balance ?? 0;
  const ok = have >= required;

  // 402 shape matches the real /api/stats 402 so the client's existing handler reacts
  // identically (opens the "Not enough credits" popup with the stat-battle reason).
  return NextResponse.json(
    ok
      ? { ok: true, required, balance: have, willUseOpus }
      : { ok: false, error: "credits", feature: "stats", required, balance: have, willUseOpus },
    { status: ok ? 200 : 402 }
  );
}
