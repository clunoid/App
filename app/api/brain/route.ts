import { NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { orchestrate } from "@/lib/brain/orchestrate";
import { getSupabaseServer } from "@/lib/supabase/server";
import { chargeCredits, chargeError, refund } from "@/lib/billing/meter";
import { ACTION_COSTS, INPUT_CAPS } from "@/lib/billing/costs";
import type { BrainRequest, BrainContext } from "@/lib/brain/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: BrainRequest;
  try {
    body = (await req.json()) as BrainRequest;
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  // Hard input cap (never feed an oversized prompt to the models).
  if (typeof body.text === "string" && body.text.length > INPUT_CAPS.brainText) body.text = body.text.slice(0, INPUT_CAPS.brainText);

  const ctx: BrainContext = {
    user: body.user ?? { isAuthed: false },
    // Accurate time/locale from the browser (so Isaac never gets the date wrong).
    now: body.client?.now ?? new Date().toISOString(),
    timezone: body.client?.timezone,
    locale: body.client?.locale,
  };

  // Coarse location hint for personalization (best-effort; raw IP is never stored —
  // we only use presence of a forwarded address to decide to set the timezone hint).
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (fwd && !fwd.startsWith("127.") && fwd !== "::1") ctx.location = body.client?.timezone;

  // Require a signed-in user (never trust body.user) and enrich the context.
  const supabase = await getSupabaseServer();
  let user: User | null = null;
  try {
    ({
      data: { user },
    } = await supabase.auth.getUser());
  } catch {
    user = null;
  }
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });
  ctx.user = {
    name: (user.user_metadata?.name as string) || (user.user_metadata?.full_name as string) || body.user?.name,
    email: user.email,
    createdAt: user.created_at,
    isAuthed: true,
  };
  try {
    const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
    if (profile?.display_name) ctx.user.name = profile.display_name;
  } catch {
    /* profile is optional */
  }

  // Meter: rate-limit + pre-charge credits for this search.
  const charge = await chargeCredits("search", ACTION_COSTS.search, { len: typeof body.text === "string" ? body.text.length : 0 });
  if (!charge.ok) return chargeError(charge);

  try {
    const scene = await orchestrate(body, ctx);
    return NextResponse.json(scene);
  } catch (err) {
    console.error("brain error:", err);
    await refund(user.id, ACTION_COSTS.search, "search");
    return NextResponse.json({
      say: "Sorry — my thoughts tangled for a second there. Could you say that again?",
      expectsInput: "voice",
    });
  }
}
