import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/requireUser";
import { isAdmin } from "@/lib/billing/meter";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * One VLAB video. PATCH persists production progress (shots/narration/final/
 * status) as the studio works, so an expensive run survives refreshes and
 * fal-CDN expiry; `finalize:true` additionally copies the finished MP4 into the
 * permanent public `vlab` storage bucket. DELETE removes the record. RLS keeps
 * every query owner-scoped.
 */

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "signin" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "restricted" }, { status: 403 });
  const { id } = await ctx.params;
  const supabase = await getSupabaseServer();
  const { data } = await supabase.from("vlab_videos").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ video: data });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "signin" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "restricted" }, { status: 403 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    shots?: unknown;
    narration?: unknown;
    finalUrl?: string;
    storageUrl?: string;
    status?: string;
    finalize?: boolean;
  };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.shots !== undefined) patch.shots = body.shots;
  if (body.narration !== undefined) patch.narration = body.narration;
  if (body.finalUrl !== undefined) patch.final_url = String(body.finalUrl).slice(0, 2_000);
  if (body.storageUrl !== undefined) patch.storage_url = String(body.storageUrl).slice(0, 2_000);
  if (body.status !== undefined) {
    if (!["planned", "producing", "done", "failed"].includes(body.status)) return NextResponse.json({ error: "bad status" }, { status: 400 });
    patch.status = body.status;
  }

  // permanence: copy the finished MP4 off the fal CDN into our own storage
  if (body.finalize && body.finalUrl) {
    const admin = getSupabaseAdmin();
    if (admin) {
      try {
        const vid = await fetch(body.finalUrl, { signal: AbortSignal.timeout(90_000) });
        if (vid.ok) {
          const buf = Buffer.from(await vid.arrayBuffer());
          if (buf.length > 0 && buf.length < 200 * 1024 * 1024) {
            await admin.storage.createBucket("vlab", { public: true }).catch(() => {});
            const path = `videos/${id}.mp4`;
            const { error: upErr } = await admin.storage.from("vlab").upload(path, buf, { contentType: "video/mp4", upsert: true });
            if (!upErr) patch.storage_url = admin.storage.from("vlab").getPublicUrl(path).data.publicUrl;
          }
        }
      } catch {
        /* best-effort — the fal URL still works right now */
      }
    }
  }

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.from("vlab_videos").update(patch).eq("id", id).eq("user_id", user.id).select("*").maybeSingle();
  if (error || !data) return NextResponse.json({ error: "update failed" }, { status: 500 });
  return NextResponse.json({ video: data });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "signin" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "restricted" }, { status: 403 });
  const { id } = await ctx.params;
  const supabase = await getSupabaseServer();
  const { error } = await supabase.from("vlab_videos").delete().eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "delete failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
