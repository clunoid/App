"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useClunoid } from "@/lib/store/useClunoid";
import { renderExperience } from "@/components/experiences/registry";

/**
 * The mutable centre of the Stage. Experiences appear, then are removed when
 * Isaac moves on — exactly one at a time.
 */
export function SceneRenderer() {
  const experience = useClunoid((s) => s.experience);

  // A stable key so AnimatePresence swaps when the experience identity changes.
  const key = experience
    ? experience.type + ("flagUrl" in experience ? experience.flagUrl : "")
    : "empty";

  return (
    <div className="flex w-full items-start justify-center">
      <AnimatePresence mode="wait">
        {experience && (
          <motion.div
            key={key}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.98 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="flex w-full justify-center"
          >
            {renderExperience(experience)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
