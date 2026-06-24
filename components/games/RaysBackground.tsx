"use client";

/**
 * The signature look: a slowly-rotating two-tone sunburst that recolors each
 * round. `hue` (0–360) sets the round's colour; the rays are two shades of it.
 * Performance: the conic-gradient is painted ONCE at a small size, then GPU
 * scaled + rotated (compositor only) — cheap even on low-end devices.
 */
export function RaysBackground({ hue }: { hue: number }) {
  const a = `hsl(${hue}, 75%, 47%)`;
  const b = `hsl(${hue}, 80%, 56%)`;
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ backgroundColor: b }}>
      <style>{"@keyframes clunoidRays{from{transform:translate(-50%,-50%) scale(4.5) rotate(0deg)}to{transform:translate(-50%,-50%) scale(4.5) rotate(360deg)}}"}</style>
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 h-[640px] w-[640px]"
        style={{
          background: `repeating-conic-gradient(from 0deg at 50% 50%, ${a} 0deg, ${a} 15deg, ${b} 15deg, ${b} 30deg)`,
          animation: "clunoidRays 70s linear infinite",
          transformOrigin: "center",
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
