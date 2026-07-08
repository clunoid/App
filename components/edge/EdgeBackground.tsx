"use client";

/**
 * Edge's material — a clean, modern, minimal dark canvas (never white): a deep
 * ink ground, a soft emerald glow bleeding from the top (matching the /home Edge
 * chip), a cool teal glow at the corner, a fine dot-matrix that fades out
 * downward, and a whisper of grain.
 * No heavy borders or bezels — quiet and premium so the data does the talking.
 * Pure CSS/SVG, no animation.
 */
export function EdgeBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: "#0a0c0d" }}>
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(85% 55% at 50% -10%, rgba(52,211,153,0.11), transparent 60%), radial-gradient(55% 45% at 102% 2%, rgba(94,234,212,0.06), transparent 55%), radial-gradient(60% 50% at 0% 100%, rgba(125,211,252,0.04), transparent 55%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.055) 1px, transparent 1.2px)",
          backgroundSize: "22px 22px",
          WebkitMaskImage: "radial-gradient(130% 90% at 50% 0%, black, transparent 82%)",
          maskImage: "radial-gradient(130% 90% at 50% 0%, black, transparent 82%)",
        }}
      />
      <svg className="absolute inset-0 h-full w-full opacity-[0.035] mix-blend-screen" aria-hidden>
        <filter id="edgeGrain">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#edgeGrain)" />
      </svg>
    </div>
  );
}
