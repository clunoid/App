import "server-only";
import { randomBytes } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * SUPPORT ATTACHMENTS — getting a file from Telegram to the person on the site.
 *
 * Telegram never hands over the file itself, only an id. Fetching it is two
 * calls: getFile turns the id into a path, then the path is downloaded from the
 * file host with the bot token in the URL. That token is the only thing
 * guarding it, which is exactly why the download is re-hosted here rather than
 * linked: a link to Telegram's copy is a link with our bot token in it, handed
 * to whoever opens the support window.
 *
 * The re-hosted name is random. The sender's own filename is kept as a label,
 * not as a path — a name that reaches the storage key is a name that can
 * collide, escape its folder, or be guessed.
 */

const BUCKET = "support-files";
const API = "https://api.telegram.org";

/** 10MB. Telegram's own bot-download ceiling is 20MB; this is the smaller of
 *  the two limits, and a support screenshot has no business being larger. */
const MAX_BYTES = 10 * 1024 * 1024;

export type Attachment = { url: string; name: string; type: string };

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};

/** Is this something a browser can render inline, or something to download? */
export function isImage(type?: string | null): boolean {
  return !!type && type.startsWith("image/");
}

/**
 * Put bytes in the bucket and return the public URL.
 *
 * Returns null rather than throwing: an attachment that cannot be stored must
 * not take the message down with it. The caller sends the text and says the
 * file did not make it, which is far better than losing both.
 */
export async function storeFile(
  bytes: ArrayBuffer,
  name: string,
  type: string,
): Promise<Attachment | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;
  if (bytes.byteLength > MAX_BYTES) {
    console.error("[files] too large:", bytes.byteLength);
    return null;
  }

  const ext = EXT[type] || (name.match(/\.([A-Za-z0-9]{1,8})$/)?.[1] ?? "bin").toLowerCase();
  const key = `${new Date().toISOString().slice(0, 10)}/${randomBytes(12).toString("hex")}.${ext}`;

  const { error } = await db.storage.from(BUCKET).upload(key, bytes, {
    contentType: type || "application/octet-stream",
    upsert: false,
  });
  if (error) {
    console.error("[files] upload failed:", error.message);
    return null;
  }

  const { data } = db.storage.from(BUCKET).getPublicUrl(key);
  if (!data?.publicUrl) return null;

  return { url: data.publicUrl, name: name.slice(0, 120) || `file.${ext}`, type: type || "application/octet-stream" };
}

/**
 * Fetch a file the owner sent in Telegram and re-host it.
 *
 * `fileId` comes off the message: the largest of the `photo` sizes, or a
 * document's own id. Photos have no filename of their own — Telegram
 * re-encodes them — so one is invented for the label.
 */
export async function saveTelegramFile(
  fileId: string,
  fallbackName: string,
  declaredType?: string,
): Promise<Attachment | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;

  try {
    const meta = await fetch(`${API}/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`, {
      cache: "no-store",
    }).then((r) => r.json() as Promise<{ ok?: boolean; result?: { file_path?: string; file_size?: number } }>);

    const path = meta?.result?.file_path;
    if (!meta?.ok || !path) {
      console.error("[files] getFile gave no path");
      return null;
    }
    if ((meta.result?.file_size ?? 0) > MAX_BYTES) {
      console.error("[files] telegram file too large");
      return null;
    }

    const res = await fetch(`${API}/file/bot${token}/${path}`, { cache: "no-store" });
    if (!res.ok) {
      console.error("[files] download failed:", res.status);
      return null;
    }

    const bytes = await res.arrayBuffer();
    const type = declaredType || res.headers.get("content-type") || guessType(path);
    const name = fallbackName || path.split("/").pop() || "file";
    return storeFile(bytes, name, type);
  } catch (e) {
    console.error("[files] telegram fetch threw:", e);
    return null;
  }
}

/** Only used when Telegram declares nothing — the path is all there is to go on. */
function guessType(path: string): string {
  const ext = (path.match(/\.([A-Za-z0-9]{1,8})$/)?.[1] ?? "").toLowerCase();
  for (const [type, e] of Object.entries(EXT)) if (e === ext) return type;
  return "application/octet-stream";
}
