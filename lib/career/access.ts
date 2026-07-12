import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { requireUser } from "@/lib/auth/requireUser";
import { isAdmin } from "@/lib/billing/meter";

/**
 * CAREER DESK access — ADMIN-ONLY for launch (same model as /trading and /edge's
 * early life): the page renders for anyone, but every byte flows through
 * /api/career/* which verify the server-side session against the immutable admin
 * allow-list. The route is absent from navigation, feature registries and the
 * sitemap.
 *
 * TO OPEN TO THE PUBLIC LATER (the revenue switch): replace the isAdmin check
 * with an entitlement check like lib/edge/access.ts (plan === 'pro' | 'max' ||
 * purchased > 0) and keep charging via the career_* actions in lib/billing/costs
 * — the credit charges are ALREADY wired on every route, admins just bypass them.
 * The RLS layer is owner-scoped from day one, so nothing else changes.
 */
export async function careerUser(): Promise<{ user: User } | { error: NextResponse }> {
  const user = await requireUser();
  if (!user) return { error: NextResponse.json({ error: "signin" }, { status: 401 }) };
  if (!isAdmin(user)) return { error: NextResponse.json({ error: "restricted" }, { status: 403 }) };
  return { user };
}
