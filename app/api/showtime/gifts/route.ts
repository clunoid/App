import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 20;

/**
 * The gift catalog for the penalty game's on-screen guide — REAL data, no guessing.
 *
 * Primary source (verified live 2026-07-12): Euler Stream's gift-catalog REST route
 * GET https://tiktok.eulerstream.com/webcast/gifts?region=US (x-api-key) → returns a
 * presigned R2 URL to TikTok's own gift/list snapshot (data.gifts[]: id, name,
 * diamond_count, image.url_list on the TikTok CDN). TikTok CDN gift images are
 * freely hotlinkable (Access-Control-Allow-Origin: *, ~257-day cache), so the stage
 * uses them directly.
 *
 * Fallback: a static list with coin values + image URLs individually verified in the
 * July 2026 catalog research (every image test-fetched OK), so the guide still
 * renders perfectly if Euler or the snapshot is unreachable.
 *
 * Public GET (nothing sensitive — it's the public gift catalog), cached server-side
 * for 6 hours per instance.
 */

type OutGift = { key: string; name: string; coins: number; image: string };

/** The 11 gifts the game maps, with research-verified values + CDN images. */
const STATIC_GIFTS: OutGift[] = [
  { key: "rose", name: "Rose", coins: 1, image: "https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/eba3a9bb85c33e017f3648eaf88d7189~tplv-obj.webp" },
  { key: "tiktok", name: "TikTok", coins: 1, image: "https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/802a21ae29f9fae5abe3693de9f874bd~tplv-obj.webp" },
  { key: "ice cream cone", name: "Ice Cream Cone", coins: 1, image: "https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/968820bc85e274713c795a6aef3f7c67~tplv-obj.webp" },
  { key: "perfume", name: "Perfume", coins: 20, image: "https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/20b8f61246c7b6032777bb81bf4ee055~tplv-obj.webp" },
  { key: "doughnut", name: "Doughnut", coins: 30, image: "https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/4e7ad6bdf0a1d860c538f38026d4e812~tplv-obj.webp" },
  { key: "hand hearts", name: "Hand Hearts", coins: 100, image: "https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/6cd022271dc4669d182cad856384870f~tplv-obj.webp" },
  { key: "corgi", name: "Corgi", coins: 299, image: "https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/148eef0884fdb12058d1c6897d1e02b9~tplv-obj.webp" },
  { key: "money gun", name: "Money Gun", coins: 500, image: "https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/e0589e95a2b41970f0f30f6202f5fce6~tplv-obj.webp" },
  { key: "galaxy", name: "Galaxy", coins: 1000, image: "https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/resource/79a02148079526539f7599150da9fd28.png~tplv-obj.webp" },
  { key: "lion", name: "Lion", coins: 29999, image: "https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/4fb89af2082a290b37d704e20f4fe729~tplv-obj.png" },
  { key: "tiktok universe", name: "TikTok Universe", coins: 44999, image: "https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/8f471afbcebfda3841a6cc515e381f58~tplv-obj.webp" },
];

/** Loose name aliases (TikTok localizes some names). */
const ALIASES: Record<string, string> = { donut: "doughnut" };

const norm = (s: string) => {
  const n = (s || "").trim().toLowerCase();
  return ALIASES[n] ?? n;
};

const CACHE_MS = 6 * 60 * 60 * 1000;
let cached: { at: number; gifts: OutGift[] } | null = null;

type SnapshotGift = { id?: number; name?: string; diamond_count?: number; image?: { url_list?: string[] } };

async function fetchLive(): Promise<OutGift[] | null> {
  const apiKey = process.env.EULER_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch("https://tiktok.eulerstream.com/webcast/gifts?region=US&webcast_language=en", {
      headers: { "x-api-key": apiKey },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { code?: number; url?: string };
    if (!d.url) return null;
    const snap = await fetch(d.url, { signal: AbortSignal.timeout(10000) });
    if (!snap.ok) return null;
    const json = (await snap.json()) as { data?: { gifts?: SnapshotGift[] } };
    const gifts = json.data?.gifts;
    if (!Array.isArray(gifts) || !gifts.length) return null;

    const byName = new Map<string, SnapshotGift>();
    for (const g of gifts) {
      const key = norm(g.name ?? "");
      if (key && !byName.has(key)) byName.set(key, g);
    }
    const out: OutGift[] = [];
    for (const s of STATIC_GIFTS) {
      const live = byName.get(s.key);
      const image = live?.image?.url_list?.[0] || s.image;
      const coins = typeof live?.diamond_count === "number" && live.diamond_count > 0 ? live.diamond_count : s.coins;
      out.push({ key: s.key, name: live?.name || s.name, coins, image });
    }
    return out;
  } catch {
    return null;
  }
}

export async function GET() {
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return NextResponse.json({ gifts: cached.gifts, source: "cache" });
  }
  const live = await fetchLive();
  const gifts = live ?? STATIC_GIFTS;
  if (live) cached = { at: Date.now(), gifts: live };
  return NextResponse.json({ gifts, source: live ? "live" : "static" });
}
