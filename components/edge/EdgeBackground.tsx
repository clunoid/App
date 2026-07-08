"use client";

/**
 * Edge's material — the same premium "engineered surface" language as the Trading
 * Desk's TerminalBackground, re-cut in an emerald key so the two admin platforms
 * read as siblings but distinct: near-black ground, a precision grid (fine minor
 * cells + brighter major rules), phosphor grain, an emerald screen-glow vignette
 * and a bezel double-rule. Pure CSS/SVG, no animation — crisp on every screen.
 */
export function EdgeBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: "#07090b" }}>
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: [
            "repeating-linear-gradient(0deg, rgba(140,170,150,0.06) 0 1px, transparent 1px 30px)",
            "repeating-linear-gradient(90deg, rgba(140,170,150,0.06) 0 1px, transparent 1px 30px)",
            "repeating-linear-gradient(0deg, rgba(52,211,153,0.05) 0 1px, transparent 1px 150px)",
            "repeating-linear-gradient(90deg, rgba(52,211,153,0.05) 0 1px, transparent 1px 150px)",
          ].join(","),
        }}
      />
      <svg className="absolute inset-0 h-full w-full opacity-[0.05] mix-blend-screen" aria-hidden>
        <filter id="edgeGrain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#edgeGrain)" />
      </svg>
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 75% at 50% 0%, rgba(52,211,153,0.07), rgba(52,211,153,0) 42%, rgba(0,0,0,0.44) 96%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-2 rounded-lg sm:inset-3"
        style={{
          border: "1px solid rgba(140,170,150,0.14)",
          boxShadow: "inset 0 0 0 3px rgba(7,9,11,0.9), inset 0 0 0 4px rgba(52,211,153,0.08)",
        }}
      />
    </div>
  );
}
