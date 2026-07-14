import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { isAdmin } from "@/lib/billing/meter";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 20;

/**
 * VLAB — a signed direct-upload URL for the browser-rendered final MP4 (the
 * file is 15-60MB; Vercel's request-body limit rules out proxying it, so the
 * browser PUTs straight to Supabase Storage). Admin-gated, and the path is
 * derived from a video id VERIFIED to belong to the caller — a client can
 * never mint an upload URL for someone else's video (or an arbitrary path).
 */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "signin" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "restricted" }, { status: 403 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "storage not configured" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { id?: string };
  const id = (body.id || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  // ownership check via the caller's OWN session (RLS-scoped)
  const supabase = await getSupabaseServer();
  const { data: row } = await supabase.from("vlab_videos").select("id").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  await admin.storage.createBucket("vlab", { public: true }).catch(() => {});
  const path = `videos/${id}.mp4`;
  await admin.storage.from("vlab").remove([path]).catch(() => {}); // allow re-renders
  const { data, error } = await admin.storage.from("vlab").createSignedUploadUrl(path);
  if (error || !data) return NextResponse.json({ error: "sign failed" }, { status: 502 });
  const publicUrl = admin.storage.from("vlab").getPublicUrl(path).data.publicUrl;
  return NextResponse.json({ uploadUrl: data.signedUrl, token: data.token, path, publicUrl });
}
