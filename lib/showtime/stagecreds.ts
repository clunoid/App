"use client";

/**
 * Stage credentials — the {key, signature} pair that authorizes the sessionless
 * stage page against /api/showtime/* routes (euler-token, tts, persist).
 *
 * CONSOLE side: the key lives in localStorage (bus.ts stageKey()); the signature is
 * minted once via the admin-gated /api/showtime/stage-auth and cached. The OBS URL
 * carries both in the fragment: /showtime/stage#k=<key>&s=<sig> (fragments never
 * reach servers or logs; the pair travels only in POST bodies to our own API).
 *
 * STAGE side: parsed from the URL fragment.
 */
import { stageKey } from "./bus";

export type StageCreds = { k: string; s: string };

const SIG_KEY = "showtime_stage_sig";

/** Console: key from localStorage + signature minted/cached via the admin route. */
export async function consoleCreds(): Promise<StageCreds | null> {
  const k = stageKey();
  if (!k) return null;
  try {
    const cached = localStorage.getItem(SIG_KEY);
    if (cached) {
      const p = JSON.parse(cached) as StageCreds;
      if (p.k === k && p.s) return p;
    }
  } catch {
    /* re-mint */
  }
  try {
    const res = await fetch("/api/showtime/stage-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ k }),
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { s?: string };
    if (!d.s) return null;
    const creds = { k, s: d.s };
    try {
      localStorage.setItem(SIG_KEY, JSON.stringify(creds));
    } catch {
      /* ignore */
    }
    return creds;
  } catch {
    return null;
  }
}

/** Stage: parse #k=…&s=… (query params accepted as a fallback). */
export function fragmentCreds(): (StageCreds & { preview: boolean; muted: boolean }) | null {
  if (typeof window === "undefined") return null;
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const search = new URLSearchParams(window.location.search);
  const k = hash.get("k") || search.get("k") || "";
  const s = hash.get("s") || search.get("s") || "";
  if (!k) return null;
  const preview = hash.get("preview") === "1" || search.get("preview") === "1";
  const muted = preview || hash.get("muted") === "1" || search.get("muted") === "1";
  return { k, s, preview, muted };
}

/** POST a /api/showtime/* op with the creds attached. Returns parsed JSON or null. */
export async function stageApi<T>(path: string, creds: StageCreds, body: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, k: creds.k, s: creds.s }),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
