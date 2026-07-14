/**
 * VLAB — thin server-side fal.ai queue client. The browser NEVER sees FAL_KEY:
 * the console submits/polls through /api/vlab/fal, which whitelists the exact
 * models the pilot uses and only follows queue.fal.run URLs (no SSRF).
 *
 * fal queue REST: POST https://queue.fal.run/{model} (Authorization: Key …) →
 * { request_id, status_url, response_url }; poll status_url until COMPLETED,
 * then GET response_url for the model's output JSON.
 */

export const FAL_MODELS = {
  sheet: "fal-ai/nano-banana", // the character sheet — the identity anchor (~$0.04/image)
  frame: "fal-ai/nano-banana/edit", // each keyframe EDITED from [sheet + previous frame] → locked consistency
  video: "fal-ai/kling-video/v3/pro/image-to-video", // 3-15s clips; end_image_url = flowing transitions (~$0.11/s)
  compose: "fal-ai/ffmpeg-api/compose", // cut clips to narration timing + overlay the voice track
} as const;

const ALLOWED_MODELS = new Set<string>(Object.values(FAL_MODELS));
const QUEUE_ORIGIN = "https://queue.fal.run/";

export const hasFal = () => !!process.env.FAL_KEY;

export type FalSubmit = { requestId: string; statusUrl: string; responseUrl: string };

export async function falSubmit(model: string, input: unknown): Promise<FalSubmit> {
  if (!ALLOWED_MODELS.has(model)) throw new Error("model not allowed");
  const res = await fetch(`${QUEUE_ORIGIN}${model}`, {
    method: "POST",
    headers: { Authorization: `Key ${process.env.FAL_KEY}`, "content-type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`fal submit ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const d = (await res.json()) as { request_id?: string; status_url?: string; response_url?: string };
  if (!d.request_id || !d.status_url || !d.response_url) throw new Error("fal submit: malformed response");
  return { requestId: d.request_id, statusUrl: d.status_url, responseUrl: d.response_url };
}

/** Follow a queue URL previously returned by falSubmit. Refuses anything that
 *  isn't a queue.fal.run URL, so this proxy can't be aimed elsewhere. */
export async function falFollow(url: string): Promise<{ status: number; body: unknown }> {
  if (!url.startsWith(QUEUE_ORIGIN)) throw new Error("url not allowed");
  const res = await fetch(url, {
    headers: { Authorization: `Key ${process.env.FAL_KEY}` },
    signal: AbortSignal.timeout(25_000),
  });
  const body = (await res.json().catch(() => ({}))) as unknown;
  return { status: res.status, body };
}
