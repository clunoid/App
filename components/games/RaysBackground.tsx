"use client";

/**
 * The signature look: a slowly-rotating two-tone sunburst that recolors each
 * round. `hue` (0–360) sets the round's colour; the rays are two shades of it.
 * The gradient is rendered at FULL size (≈150vmax) and only rotated — NOT a
 * small bitmap scaled up, which used to look blurry/low-quality on phones.
 */
export function RaysBackground({ hue }: { hue: number }) {
  const a = `hsl(${hue}, 75%, 47%)`;
  const b = `hsl(${hue}, 80%, 56%)`;
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ backgroundColor: b }}>
      <style>
        {"@keyframes clunoidRays{from{transform:translate(-50%,-50%) rotate(0deg)}to{transform:translate(-50%,-50%) rotate(360deg)}}"}
      </style>
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2"
        style={{
          width: "150vmax",
          height: "150vmax",
          background: `repeating-conic-gradient(from 0deg at 50% 50%, ${a} 0deg 15deg, ${b} 15deg 30deg)`,
          animation: "clunoidRays 80s linear infinite",
          willChange: "transform",
        }}
      />
      {/* bright center + soft edge vignette for depth */}
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(circle at 50% 44%, rgba(255,255,255,0.18), rgba(0,0,0,0.16) 78%)" }}
      />
    </div>
  );
}
