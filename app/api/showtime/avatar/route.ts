import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 10;

/**
 * TikTok avatar proxy — the stage draws viewer profile pictures onto its canvas,
 * which requires CORS-clean images; TikTok CDN headers are not a guarantee. This
 * proxies only TikTok CDN hosts, caps the size, and caches hard (avatars are
 * content-addressed URLs, so immutable caching is safe).
 */

const MAX_BYTES = 512 * 1024;

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u") || "";
  let url: URL;
  try {
    url = new URL(u);
  } catch {
    return new NextResponse("bad url", { status: 400 });
  }
  const host = url.hostname.toLowerCase();
  const okHost = url.protocol === "https:" && (host.includes("tiktokcdn") || host.endsWith("tiktok.com"));
  if (!okHost) return new NextResponse("host not allowed", { status: 400 });

  try {
    const res = await fetch(url.toString(), { headers: { accept: "image/*" }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return new NextResponse("upstream error", { status: 502 });
    const type = res.headers.get("content-type") || "image/jpeg";
    if (!type.startsWith("image/") || type.includes("svg")) return new NextResponse("not an image", { status: 400 });
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > MAX_BYTES) return new NextResponse("size", { status: 400 });
    return new NextResponse(buf, {
      headers: {
        "content-type": type,
        "cache-control": "public, max-age=604800, immutable",
      },
    });
  } catch {
    return new NextResponse("fetch failed", { status: 502 });
  }
}
