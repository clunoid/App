/**
 * Maps an Edge API error response to friendly UI copy, shared by the console and
 * the video studio so a blocked prediction / video / narration all speak the same
 * language. `upgrade:true` means the fix is a plan/credits purchase → show a link
 * to /pricing. Pure + client-safe.
 */
export type EdgeGate = { message: string; upgrade: boolean };

export function edgeGate(status: number, error?: string): EdgeGate | null {
  if (status === 401) return { message: "Sign in to use Edge.", upgrade: false };
  if (status === 402 && error === "plan") return { message: "Edge is a Pro feature — upgrade to Pro or Max to run predictions and videos.", upgrade: true };
  if (status === 402) return { message: "You're out of credits. Top up or upgrade to keep going.", upgrade: true };
  if (status === 429) return { message: "You're going a bit fast — give it a few seconds and try again.", upgrade: false };
  return null;
}
