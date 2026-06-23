"use client";

import type { Experience } from "@/lib/brain/scene";
import { RichCard } from "./RichCard";
import { Explainer } from "./Explainer";

/**
 * Maps a validated Experience to its React component. Adding a new experience
 * to Clunoid means: add it to the Scene schema + register it here. Nothing
 * else in the pipeline changes.
 */
export function renderExperience(exp: Experience) {
  switch (exp.type) {
    case "rich_card":
      return <RichCard data={exp} />;
    case "explainer":
      return <Explainer data={exp} />;
    default:
      return null;
  }
}
