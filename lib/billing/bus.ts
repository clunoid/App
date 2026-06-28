"use client";

/**
 * A tiny decoupled bridge so low-level fetch helpers can trigger billing UX
 * (login / upgrade / rate-limit) and a balance refresh WITHOUT importing the
 * React stores — which would create import cycles. `BillingGate` binds the real
 * handlers on mount.
 */
type StatusFn = (status: number) => void;
let onStatus: StatusFn | null = null;
let onRefresh: (() => void) | null = null;

export function bindBilling(handlers: { status: StatusFn; refresh: () => void }): void {
  onStatus = handlers.status;
  onRefresh = handlers.refresh;
}

/** Report a metered response's status. Returns true if it was a billing rejection
 *  (401 / 402 / 429), so the caller knows the request was blocked (not a real failure). */
export function reportBillingStatus(status: number): boolean {
  if (status === 401 || status === 402 || status === 429) {
    onStatus?.(status);
    return true;
  }
  return false;
}

/** Ask the balance chip to re-fetch (after a successful metered action). */
export function refreshCredits(): void {
  onRefresh?.();
}
