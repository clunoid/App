import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { isAdmin } from "@/lib/billing/meter";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendPushToOne } from "@/lib/trading/push";

export const runtime = "nodejs";

/**
 * Persist (POST) or remove (DELETE) a browser's Web Push subscription. Admin-only
 * and service-role-backed, exactly like the rest of the desk. Because the row
 * lives server-side, once a device is subscribed the scheduled scanner can push
 * alerts to it forever — through refreshes, closed tabs and reboots — with no
 * client polling. POST also fires a one-off confirmation push so the operator
 * SEES that delivery works the moment they opt in.
 */
type SubBody = { subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } } };

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user || !isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: "no service role" }, { status: 500 });

  const body = (await req.json().catch(() => ({}))) as SubBody;
  const sub = body.subscription;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json({ error: "invalid subscription" }, { status: 400 });
  }

  const { error } = await db
    .from("trading_push_subs")
    .upsert({ endpoint: sub.endpoint, subscription: sub, user_agent: req.headers.get("user-agent") || null, last_ok_at: new Date().toISOString() }, { onConflict: "endpoint" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // immediate confirmation — to THIS device only (not a fan-out to every sub),
  // so the operator sees a real push land right away the moment they opt in
  const testDelivered = await sendPushToOne(sub as unknown as Parameters<typeof sendPushToOne>[0], {
    title: "Clunoid Trading Desk · alerts on",
    body: "You'll get a push here whenever a validated signal fires — even with this tab closed. 24/5, fully autonomous.",
    tag: "trading-alerts-enabled",
    url: "/trading",
  });
  return NextResponse.json({ ok: true, testDelivered });
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser();
  if (!user || !isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: "no service role" }, { status: 500 });

  const body = (await req.json().catch(() => ({}))) as { endpoint?: string };
  if (!body.endpoint) return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  await db.from("trading_push_subs").delete().eq("endpoint", body.endpoint);
  return NextResponse.json({ ok: true });
}
