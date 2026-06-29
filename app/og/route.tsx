import { ImageResponse } from "next/og";

export const runtime = "nodejs";

/**
 * Dynamic Open Graph / Twitter card. One shared generator for every marketing
 * page — the page passes its title via `?t=`, so each page gets its own branded
 * 1200×630 card without a separate image file per route.
 *
 * Example: /og?t=Free%20Bar%20Chart%20Race%20Maker
 */
export function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = (searchParams.get("t") || "Talk to Isaac — an AI that shows you anything").trim();
  // Drop a trailing " | Clunoid"/" — Clunoid" so the wordmark isn't doubled.
  const title = raw.replace(/\s*[—|]\s*Clunoid\s*$/i, "").slice(0, 140);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          background: "#1F1E1C",
          padding: "84px",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -140,
            right: -120,
            width: 560,
            height: 560,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(224,152,92,0.40), rgba(224,152,92,0) 70%)",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #F0B27A, #D9824B)",
              boxShadow: "0 0 60px rgba(224,152,92,0.55)",
            }}
          />
          <div style={{ fontSize: 56, fontWeight: 700, color: "#F7F4ED", letterSpacing: -1 }}>Clunoid</div>
        </div>
        <div style={{ marginTop: 40, fontSize: 60, fontWeight: 700, color: "#F7F4ED", maxWidth: 1000, lineHeight: 1.15 }}>
          {title}
        </div>
        <div style={{ position: "absolute", bottom: 70, left: 84, fontSize: 28, fontWeight: 600, color: "#E0985C" }}>
          clunoid.com
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      // Deterministic per title → cache hard at the CDN so the public, unauth
      // image endpoint can't be used for repeated render/resource abuse.
      headers: { "Cache-Control": "public, max-age=31536000, immutable" },
    }
  );
}
