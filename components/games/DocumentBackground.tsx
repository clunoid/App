"use client";

/**
 * The "official document" look for the multiple-choice mode: a grey, security-
 * printed paper (certificate / title-deed / executive-order feel) — a fine
 * guilloché weave, a paper grain, a soft vignette and a double-ruled border.
 * Pure CSS/SVG, no animation (cheap, crisp on every screen).
 */
export function DocumentBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: "#c8c5bd" }}>
      {/* fine security weave (guilloché) */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: [
            "repeating-linear-gradient(45deg, rgba(38,33,26,0.05) 0 1px, transparent 1px 6px)",
            "repeating-linear-gradient(-45deg, rgba(38,33,26,0.05) 0 1px, transparent 1px 6px)",
            "repeating-radial-gradient(circle at 50% 40%, rgba(38,33,26,0.04) 0 1px, transparent 1px 13px)",
          ].join(","),
        }}
      />
      {/* paper grain */}
      <svg className="absolute inset-0 h-full w-full opacity-[0.06] mix-blend-multiply" aria-hidden>
        <filter id="docGrain">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#docGrain)" />
      </svg>
      {/* centre highlight + edge vignette for depth */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 34%, rgba(255,255,255,0.5), rgba(255,255,255,0) 42%, rgba(46,36,24,0.2) 95%)",
        }}
      />
      {/* certificate double-ruled border */}
      <div
        className="pointer-events-none absolute inset-2.5 rounded sm:inset-5"
        style={{
          border: "1.5px solid rgba(46,38,28,0.3)",
          boxShadow: "inset 0 0 0 4px rgba(247,244,237,0.35), inset 0 0 0 5.5px rgba(46,38,28,0.18)",
        }}
      />
    </div>
  );
}
