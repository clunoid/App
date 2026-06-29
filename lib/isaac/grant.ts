"use client";

/**
 * Ask the server whether Isaac's premium (ElevenLabs) voice should host this
 * game/search session. Free users get him for their FIRST game and FIRST search;
 * after that he's off and we nudge them to subscribe. Subscribers always get him.
 *
 * Server-authoritative (the one-time trial can't be reset client-side) and
 * fail-open here: on a transient error we return true, because /api/tts is the
 * real gate — it returns 204 (→ fallback voice) for an over-trial free user
 * regardless of what this call said.
 */
export async function grantIsaac(feature: "game" | "search"): Promise<boolean> {
  try {
    const res = await fetch("/api/isaac/grant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ feature }),
    });
    if (!res.ok) return true;
    const d = (await res.json()) as { isaac?: boolean };
    return d.isaac !== false;
  } catch {
    return true;
  }
}
