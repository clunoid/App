/** Browser-only sim balance — editable starting balance for deriv bot simulation. */
export const SIM_BALANCE_KEY = "clunoid_sim_balance";
export const SIM_BALANCE_TUTORIAL_KEY = "clunoid_sim_balance_tutorial_dismissed";
export const DEFAULT_SIM_BALANCE = 1000;

export function getSimBalance(): number {
  if (typeof window === "undefined") return DEFAULT_SIM_BALANCE;
  try {
    const stored = localStorage.getItem(SIM_BALANCE_KEY);
    if (stored != null) {
      const n = parseFloat(stored);
      if (Number.isFinite(n) && n >= 0) return n;
    }
  } catch { /* ignore */ }
  const fromUrl = new URLSearchParams(window.location.search).get("balance");
  if (fromUrl) {
    const n = parseFloat(fromUrl);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return DEFAULT_SIM_BALANCE;
}

export function setSimBalance(amount: number): number {
  const value = Math.max(0, Math.round(amount * 100) / 100);
  try { localStorage.setItem(SIM_BALANCE_KEY, String(value)); } catch { /* ignore */ }
  return value;
}

export function isSimTutorialDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try { return localStorage.getItem(SIM_BALANCE_TUTORIAL_KEY) === "1"; } catch { return false; }
}

export function dismissSimTutorial(): void {
  try { localStorage.setItem(SIM_BALANCE_TUTORIAL_KEY, "1"); } catch { /* ignore */ }
}
