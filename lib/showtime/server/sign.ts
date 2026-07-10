import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed stage credentials.
 *
 * The stage page (/showtime/stage) is public — it runs sessionless inside TikTok
 * LIVE Studio's capture browser — yet it must call privileged routes (euler-token,
 * tts, persist). So the admin console mints a server signature over the stage key
 * once (admin-gated /api/showtime/stage-auth), and the OBS URL carries both:
 *   #k=<stage key>&s=<HMAC(key)>
 * The fragment never reaches servers/logs; the pair is only ever sent in POST
 * bodies to our own API, where verifyStageKey() authorizes the call.
 *
 * The HMAC secret derives from CRON_SECRET (already provisioned in production) —
 * no new environment configuration required.
 */

function secret(): string | null {
  const s = process.env.CRON_SECRET;
  return s ? `showtime:${s}` : null;
}

export function signStageKey(key: string): string | null {
  const sec = secret();
  if (!sec || !key) return null;
  return createHmac("sha256", sec).update(key).digest("hex");
}

export function verifyStageKey(key: string, sig: string): boolean {
  const expect = signStageKey(key);
  if (!expect || !sig || sig.length !== expect.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expect, "hex"), Buffer.from(sig, "hex"));
  } catch {
    return false;
  }
}
