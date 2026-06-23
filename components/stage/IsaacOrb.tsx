"use client";

import { motion } from "framer-motion";
import { useClunoid } from "@/lib/store/useClunoid";

/**
 * Isaac's living presence (original warm-clay design). Floats gently, scales to
 * his voice while speaking, and ripples outward to the user's voice while
 * listening. No color change — clay throughout.
 */
export function IsaacOrb({ size = 150 }: { size?: number }) {
  const isaac = useClunoid((s) => s.isaac);
  const amplitude = useClunoid((s) => s.amplitude);
  const micLevel = useClunoid((s) => s.micLevel);

  const speaking = isaac === "speaking";
  const thinking = isaac === "thinking";
  const listening = !speaking && !thinking && micLevel > 0.04;

  const scale = speaking ? 1 + amplitude * 0.32 : 1 + micLevel * 0.18;
  const core = size * 0.6;

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }} aria-label={`Isaac is ${isaac}`}>
      {/* Listening ripples (react to the user's voice) */}
      {[0, 1].map((i) => (
        <motion.span
          key={i}
          className="absolute rounded-full border border-clay/50"
          style={{ width: core, height: core }}
          animate={{
            scale: listening ? 1 + micLevel * (1.4 + i * 0.8) : 1,
            opacity: listening ? Math.max(0, micLevel - i * 0.15) : 0,
          }}
          transition={{ type: "spring", stiffness: 160, damping: 18 }}
        />
      ))}

      {/* Outer glow — warm clay; brightens while speaking */}
      <motion.div
        className="absolute inset-0 rounded-full bg-clay/45 blur-3xl"
        animate={{ scale: scale * 1.2, opacity: speaking ? 0.8 : isaac === "idle" ? 0.45 : 0.65 }}
        transition={{ type: "spring", stiffness: 120, damping: 18 }}
      />

      {/* Gentle perpetual float (CSS) + reactive scale (settles when idle) */}
      <motion.div
        className="animate-float relative"
        style={{ width: core, height: core }}
        animate={{ scale }}
        transition={{ type: "spring", stiffness: 240, damping: 14 }}
      >
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-clay-soft to-clay shadow-glow" />
        {/* Sheen */}
        <div className="absolute left-[18%] top-[16%] h-[26%] w-[26%] rounded-full bg-white/45 blur-md" />
      </motion.div>

      {/* Thinking ring */}
      {thinking && (
        <motion.span
          className="absolute rounded-full border-2 border-clay/60 border-t-transparent"
          style={{ width: size * 0.8, height: size * 0.8 }}
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
        />
      )}
    </div>
  );
}
