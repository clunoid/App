import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { isAdmin } from "@/lib/billing/meter";
import dns from "node:dns/promises";
import net from "node:net";

export const runtime = "nodejs";
export const maxDuration = 20;

const UA = "Mozilla/5.0 (compatible; ClunoidEdge/1.0; +https://clunoid.com)";
const MAX_BYTES = 500_000; // keep logos small (localStorage-friendly, canvas-safe)

/* ── SSRF guard: validate the RESOLVED ip of every host we touch ───────────── */
function ipv4Private(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127 || a === 255) return true;
  if (a === 169 && b === 254) return true; // link-local (cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast + reserved
  return false;
}
function ipPrivate(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) return ipv4Private(ip);
  if (v === 6) {
    const s = ip.toLowerCase();
    if (s === "::1" || s === "::") return true;
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return ipv4Private(mapped[1]);
    if (/^::ffff:/.test(s)) return true; // hex-form IPv4-mapped → treat as unsafe
    if (/^fe[89ab]/.test(s)) return true; // link-local fe80::/10
    if (/^f[cd]/.test(s)) return true; // unique-local fc00::/7
    if (/^ff/.test(s)) return true; // multicast
    return false;
  }
  return true; // not a valid IP → unsafe
}

/** Parse + resolve a URL and reject anything pointing at a private/reserved host. */
async function safeUrl(raw: string): Promise<URL | null> {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.port && u.port !== "80" && u.port !== "443") return null; // no odd ports (port-scanning)
  try {
    const addrs = await dns.lookup(u.hostname, { all: true });
    if (!addrs.length || addrs.some((a) => ipPrivate(a.address))) return null;
  } catch {
    return null;
  }
  return u;
}

/** fetch that validates every hop (redirects followed manually + re-checked). */
async function safeFetch(raw: string, accept: string): Promise<Response | null> {
  let target = raw;
  for (let hop = 0; hop < 4; hop++) {
    const u = await safeUrl(target);
    if (!u) return null;
    let r: Response;
    try {
      r = await fetch(u.toString(), { headers: { "user-agent": UA, accept }, redirect: "manual", signal: AbortSignal.timeout(8000) });
    } catch {
      return null;
    }
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.get("location");
      if (!loc) return null;
      try {
        target = new URL(loc, u).toString();
      } catch {
        return null;
      }
      continue;
    }
    return r;
  }
  return null;
}

async function fetchText(url: string): Promise<string | null> {
  const r = await safeFetch(url, "text/html");
  if (!r || !r.ok) return null;
  try {
    return (await r.text()).slice(0, 400_000);
  } catch {
    return null;
  }
}

/** Download an image → base64 data URL (canvas-safe when served from our origin). */
async function toDataUrl(url: string): Promise<string | null> {
  const r = await safeFetch(url, "image/*");
  if (!r || !r.ok) return null;
  const type = (r.headers.get("content-type") || "").split(";")[0].trim();
  if (!type.startsWith("image/") || type.includes("svg")) return null; // svg can taint / not canvas-friendly
  const cl = parseInt(r.headers.get("content-length") || "", 10);
  if (cl && cl > MAX_BYTES) return null;
  try {
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length || buf.length > MAX_BYTES) return null;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Candidate logo URLs from the page <head>, best first (square icons over og banners). */
function candidates(html: string, base: URL): string[] {
  const abs = (href: string) => { try { return new URL(href, base).toString(); } catch { return null; } };
  const out: string[] = [];
  const attr = (tag: string, re: RegExp) => { const m = tag.match(re); return m ? m[2] : null; };
  const tags = html.match(/<(?:link|meta)\b[^>]*>/gi) || [];
  const icons: { href: string; size: number }[] = [];
  for (const tag of tags) {
    const rel = (attr(tag, /\brel=(["'])(.*?)\1/i) || "").toLowerCase();
    const prop = (attr(tag, /\bproperty=(["'])(.*?)\1/i) || attr(tag, /\bname=(["'])(.*?)\1/i) || "").toLowerCase();
    const href = attr(tag, /\bhref=(["'])(.*?)\1/i);
    const content = attr(tag, /\bcontent=(["'])(.*?)\1/i);
    const size = parseInt((attr(tag, /\bsizes=(["'])(.*?)\1/i) || "").split("x")[0], 10) || 0;
    if (rel.includes("apple-touch-icon") && href) icons.push({ href, size: size || 180 });
    else if (rel.includes("icon") && href) icons.push({ href, size: size || 32 });
    if ((prop === "og:image" || prop === "twitter:image") && content) { const u = abs(content); if (u) out.push(u); }
  }
  icons.sort((a, b) => b.size - a.size);
  return [...(icons.map((i) => abs(i.href)).filter(Boolean) as string[]), ...out];
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user || !isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const website = ((await req.json().catch(() => ({}))) as { website?: string }).website?.trim() || "";
  let base: URL;
  try {
    base = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`);
    if (base.protocol !== "http:" && base.protocol !== "https:") throw new Error("scheme");
  } catch {
    return NextResponse.json({ error: "Enter a valid website (e.g. yourbrand.com)." }, { status: 400 });
  }

  const name = base.hostname.replace(/^www\./, "");
  const tried = new Set<string>();
  const html = await fetchText(base.toString());
  const list = html ? candidates(html, base) : [];
  list.push(new URL("/favicon.ico", base).toString());
  list.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(base.hostname)}&sz=128`);

  for (const cand of list) {
    if (tried.has(cand)) continue;
    tried.add(cand);
    const data = await toDataUrl(cand);
    if (data) return NextResponse.json({ logo: data, name, website: name });
  }
  // no usable image — still return the derived name so branding can use text only
  return NextResponse.json({ logo: null, name, website: name });
}
