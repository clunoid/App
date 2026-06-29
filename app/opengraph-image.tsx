import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "Clunoid — Talk to Isaac, an AI that shows you anything";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Branded Open Graph / Twitter card for link previews.
export default function OpengraphImage() {
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
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <div
            style={{
              width: 92,
              height: 92,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #F0B27A, #D9824B)",
              boxShadow: "0 0 70px rgba(224,152,92,0.55)",
            }}
          />
          <div style={{ fontSize: 92, fontWeight: 700, color: "#F7F4ED", letterSpacing: -2 }}>Clunoid</div>
        </div>
        <div style={{ marginTop: 34, fontSize: 46, color: "#F7F4ED", maxWidth: 980, lineHeight: 1.25 }}>
          Talk to Isaac — an AI that shows you anything.
        </div>
        <div style={{ marginTop: 22, fontSize: 30, color: "#B8B2A7" }}>
          Stat Battles · Guess the Country · Recap videos · AI voices
        </div>
        <div style={{ position: "absolute", bottom: 70, left: 84, fontSize: 30, fontWeight: 600, color: "#E0985C" }}>
          clunoid.com
        </div>
      </div>
    ),
    { ...size }
  );
}
