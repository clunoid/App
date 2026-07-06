"use client";

/**
 * The trading desk's material — the same "engineered surface" language as Stat
 * Battle's DocumentBackground (fine weave, paper grain, vignette, ruled border)
 * re-cut for a quant terminal: near-black ground, a precision GRID in place of
 * the guilloché (fine minor cells + brighter major rules, like chart paper),
 * phosphor grain, a soft screen-glow vignette and a bezel double-rule.
 * Pure CSS/SVG, no animation — cheap and crisp on every screen.
 */
export function TerminalBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: "#060709" }}>
      {/* precision grid: fine minor cells + major rules every 5 cells */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: [
            "repeating-linear-gradient(0deg, rgba(126,152,178,0.06) 0 1px, transparent 1px 28px)",
            "repeating-linear-gradient(90deg, rgba(126,152,178,0.06) 0 1px, transparent 1px 28px)",
            "repeating-linear-gradient(0deg, rgba(79,209,197,0.055) 0 1px, transparent 1px 140px)",
            "repeating-linear-gradient(90deg, rgba(79,209,197,0.055) 0 1px, transparent 1px 140px)",
          ].join(","),
        }}
      />
      {/* phosphor grain (screen-blended so it lifts the black, never muddies it) */}
      <svg className="absolute inset-0 h-full w-full opacity-[0.05] mix-blend-screen" aria-hidden>
        <filter id="deskGrain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#deskGrain)" />
      </svg>
      {/* screen glow up top + edge vignette for depth */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(110% 70% at 50% 0%, rgba(79,209,197,0.06), rgba(79,209,197,0) 40%, rgba(0,0,0,0.42) 96%)",
        }}
      />
      {/* bezel double-rule (the terminal's 'certificate border') */}
      <div
        className="pointer-events-none absolute inset-2 rounded-lg sm:inset-3"
        style={{
          border: "1px solid rgba(126,152,178,0.14)",
          boxShadow: "inset 0 0 0 3px rgba(6,7,9,0.9), inset 0 0 0 4px rgba(79,209,197,0.08)",
        }}
      />
    </div>
  );
}
