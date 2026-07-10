import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { requireUser } from "@/lib/auth/requireUser";
import { isAdmin } from "@/lib/billing/meter";
import { verifyStageKey } from "@/lib/showtime/server/sign";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * Stage persistence — the crash-resume + recognition backbone. All writes flow
 * through here with the service role (the tables have RLS enabled and zero client
 * policies). Authorized by signed stage credentials or an admin session.
 *
 * ops:
 *   save    { state, room }                       — snapshot upsert (stage, every 5s)
 *   restore {}                                    — { state, room } | null
 *   gift    { user:{id,name,avatarUrl}, coins }   — gifter totals (+ monument at 10k+)
 *   war     { rows:[{id,name,avatarUrl,rank}] }   — per-war participation + best rank
 *   top     {}                                    — all-time top gifters + monuments
 */

type PersistBody = {
  k?: string;
  s?: string;
  op?: string;
  state?: unknown;
  room?: string;
  user?: { id?: string; name?: string; avatarUrl?: string };
  coins?: number;
  rows?: { id?: string; name?: string; avatarUrl?: string; rank?: number }[];
};

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as PersistBody;

  let authorized = false;
  if (body.k && body.s && verifyStageKey(body.k, body.s)) authorized = true;
  if (!authorized) {
    const user = await requireUser();
    if (user && isAdmin(user)) authorized = true;
  }
  if (!authorized) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "unconfigured" }, { status: 501 });

  const keyHash = createHash("sha256").update(String(body.k || "admin")).digest("hex");

  try {
    switch (body.op) {
      case "save": {
        const room = String(body.room || "").slice(0, 80);
        const { error } = await admin
          .from("showtime_snapshots")
          .upsert({ key_hash: keyHash, state: body.state ?? {}, room, updated_at: new Date().toISOString() }, { onConflict: "key_hash" });
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }
      case "restore": {
        const { data, error } = await admin
          .from("showtime_snapshots")
          .select("state, room, updated_at")
          .eq("key_hash", keyHash)
          .maybeSingle();
        if (error) throw error;
        return NextResponse.json({ snapshot: data?.state ?? null, room: data?.room ?? "", updatedAt: data?.updated_at ?? null });
      }
      case "gift": {
        const id = String(body.user?.id || "").toLowerCase().slice(0, 60);
        const coins = Math.max(0, Math.round(body.coins || 0));
        if (!id || !coins) return NextResponse.json({ error: "bad gift" }, { status: 400 });
        const name = String(body.user?.name || id).slice(0, 60);
        const avatar = body.user?.avatarUrl ? String(body.user.avatarUrl).slice(0, 500) : null;
        // single writer per stage → read-modify-write is race-safe enough here
        const { data: cur } = await admin.from("showtime_gifters").select("total_coins").eq("id", id).maybeSingle();
        const { error } = await admin.from("showtime_gifters").upsert(
          {
            id,
            name,
            avatar_url: avatar,
            total_coins: (cur?.total_coins ?? 0) + coins,
            last_seen: new Date().toISOString(),
          },
          { onConflict: "id" },
        );
        if (error) throw error;
        if (coins >= 10000) {
          await admin.from("showtime_monuments").insert({ user_id: id, name, coins });
        }
        return NextResponse.json({ ok: true });
      }
      case "war": {
        const rows = Array.isArray(body.rows) ? body.rows.slice(0, 50) : [];
        for (const r of rows) {
          const id = String(r.id || "").toLowerCase().slice(0, 60);
          if (!id) continue;
          const { data: cur } = await admin.from("showtime_gifters").select("wars, best_rank").eq("id", id).maybeSingle();
          const rank = Math.max(1, Math.round(r.rank || 0)) || null;
          const best = cur?.best_rank && rank ? Math.min(cur.best_rank, rank) : (rank ?? cur?.best_rank ?? null);
          await admin.from("showtime_gifters").upsert(
            {
              id,
              name: String(r.name || id).slice(0, 60),
              avatar_url: r.avatarUrl ? String(r.avatarUrl).slice(0, 500) : null,
              wars: (cur?.wars ?? 0) + 1,
              best_rank: best,
              last_seen: new Date().toISOString(),
            },
            { onConflict: "id" },
          );
        }
        return NextResponse.json({ ok: true });
      }
      case "top": {
        const [gifters, monuments] = await Promise.all([
          admin.from("showtime_gifters").select("id, name, avatar_url, total_coins, wars, best_rank").order("total_coins", { ascending: false }).limit(10),
          admin.from("showtime_monuments").select("id, user_id, name, coins, created_at").order("created_at", { ascending: false }).limit(10),
        ]);
        return NextResponse.json({ gifters: gifters.data ?? [], monuments: monuments.data ?? [] });
      }
      default:
        return NextResponse.json({ error: "bad op" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "persist error" }, { status: 500 });
  }
}
