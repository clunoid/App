import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { readPurchaseToken } from "@/lib/deriv/mt5/purchaseToken";

export const runtime = "nodejs";

/**
 * Bind this device's guest purchases to the signed-in account — the "pay then
 * sign up" join. We take the device token from the first-party cookie and stamp
 * the account onto every unclaimed paid order recorded against that exact token.
 *
 * Nothing here can grant access that wasn't paid for: it only links rows the
 * webhook already wrote from a signature-verified order.paid. If the device
 * never paid, nothing is linked and the response lists whatever the account
 * already owns.
 */
export async function POST() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const token = await readPurchaseToken();
  if (token) {
    // Claim only rows for THIS device token that no account has taken yet.
    await admin
      .from("mt5_purchases")
      .update({ user_id: user.id, email: user.email ?? null })
      .eq("purchase_token", token)
      .is("user_id", null);
  }

  const { data } = await admin.from("mt5_purchases").select("bot_id").eq("user_id", user.id);
  const owned = Array.from(new Set((data ?? []).map((r) => r.bot_id as string)));
  return NextResponse.json({ owned });
}
