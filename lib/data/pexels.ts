/**
 * Pexels media — free, reliable, hotlink-safe stock PHOTOS and VIDEO clips.
 * This is the primary engine for scene/action visuals (and the only video
 * source). Gated on PEXELS_API_KEY; without it we fall back to other sources.
 */
const API = "https://api.pexels.com";
const hasKey = () => !!process.env.PEXELS_API_KEY;
export const hasPexels = hasKey;

type VideoFile = { link?: string; width?: number; file_type?: string };
type PexelsVideo = { image?: string; video_files?: VideoFile[] };
type PexelsPhoto = { src?: { original?: string; large2x?: string; large?: string } };

/** Top photo URLs for a query (full resolution). */
export async function pexelsPhotos(query: string, n = 4): Promise<string[]> {
  const key = process.env.PEXELS_API_KEY;
  if (!key || !query.trim()) return [];
  try {
    const res = await fetch(
      `${API}/v1/search?query=${encodeURIComponent(query)}&per_page=${n}&orientation=landscape`,
      { headers: { Authorization: key } }
    );
    if (!res.ok) return [];
    const d = (await res.json()) as { photos?: PexelsPhoto[] };
    return (d.photos ?? [])
      .map((p) => p.src?.original || p.src?.large2x || p.src?.large)
      .filter((u): u is string => !!u);
  } catch {
    return [];
  }
}

/**
 * Stock-footage clips sized for CANVAS compositing (motion graphics b-roll): picks
 * the smallest MP4 rendition ≥ ~960px wide (typically the ~1-3 MB SD file) so the
 * client can download + seek it quickly, plus the poster for a graceful fallback.
 * Pexels files are served with Access-Control-Allow-Origin:* (verified), so clips
 * drawn with crossOrigin="anonymous" never taint the export canvas.
 */
export async function pexelsClips(query: string, n = 2, orientation: "landscape" | "portrait" = "landscape"): Promise<{ url: string; poster?: string; width: number; height: number }[]> {
  const key = process.env.PEXELS_API_KEY;
  if (!key || !query.trim()) return [];
  try {
    const res = await fetch(
      `${API}/videos/search?query=${encodeURIComponent(query)}&per_page=${Math.max(2, n)}&orientation=${orientation}`,
      { headers: { Authorization: key } }
    );
    if (!res.ok) return [];
    const d = (await res.json()) as { videos?: (PexelsVideo & { duration?: number })[] };
    const out: { url: string; poster?: string; width: number; height: number }[] = [];
    for (const v of d.videos ?? []) {
      const mp4s = (v.video_files ?? [])
        .filter((f): f is VideoFile & { link: string; width: number } => f.file_type === "video/mp4" && !!f.link && !!f.width)
        .sort((a, b) => a.width - b.width);
      // smallest rendition that's still ≥960 wide; else the largest available
      const pick = mp4s.find((f) => f.width >= 960) ?? mp4s[mp4s.length - 1];
      if (pick?.link) out.push({ url: pick.link, poster: v.image, width: pick.width, height: (pick as VideoFile & { height?: number }).height ?? 0 });
      if (out.length >= n) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** Top video clips for a query — an MP4 around HD width, plus a poster image. */
export async function pexelsVideos(query: string, n = 4): Promise<{ url: string; poster?: string }[]> {
  const key = process.env.PEXELS_API_KEY;
  if (!key || !query.trim()) return [];
  try {
    const res = await fetch(
      `${API}/videos/search?query=${encodeURIComponent(query)}&per_page=${n}&orientation=landscape`,
      { headers: { Authorization: key } }
    );
    if (!res.ok) return [];
    const d = (await res.json()) as { videos?: PexelsVideo[] };
    const out: { url: string; poster?: string }[] = [];
    for (const v of d.videos ?? []) {
      const mp4s = (v.video_files ?? [])
        .filter((f) => f.file_type === "video/mp4" && f.link)
        .sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
      // Full resolution — the highest-quality MP4 Pexels offers for this clip.
      const pick = mp4s[mp4s.length - 1];
      if (pick?.link) out.push({ url: pick.link, poster: v.image });
    }
    return out;
  } catch {
    return [];
  }
}
