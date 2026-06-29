"use client";

import { create } from "zustand";

export type AutoReload = { enabled: boolean; threshold: number; amountCents: number };

type BillingState = {
  authed: boolean;
  plan: string;
  status: string;
  balance: number;
  purchased: number;
  monthlyGrant: number;
  periodEnd: string | null;
  autoReload: AutoReload;
  loaded: boolean;
  upgradeOpen: boolean;
  creditOpen: boolean;
  notice: string | null;
  busyPlan: string | null;
  buyingCredits: boolean;
  refresh: () => Promise<void>;
  openUpgrade: () => void;
  closeUpgrade: () => void;
  openCredit: () => void;
  closeCredit: () => void;
  setNotice: (s: string | null) => void;
  startCheckout: (plan: "pro" | "max", interval?: "monthly" | "annual") => Promise<void>;
  openPortal: () => Promise<void>;
  buyCredits: (amountCents: number) => Promise<void>;
  saveAutoReload: (cfg: AutoReload) => Promise<boolean>;
  maybeAutoReload: () => Promise<void>;
};

// Client guard so we don't fire concurrent off-session reload pings (the server
// also enforces an atomic lock + cooldown, so this is just noise-reduction).
let reloadInFlight = false;

export const useBilling = create<BillingState>((set, get) => ({
  authed: false,
  plan: "free",
  status: "active",
  balance: 0,
  purchased: 0,
  monthlyGrant: 0,
  periodEnd: null,
  autoReload: { enabled: false, threshold: 100, amountCents: 1000 },
  loaded: false,
  upgradeOpen: false,
  creditOpen: false,
  notice: null,
  busyPlan: null,
  buyingCredits: false,

  refresh: async () => {
    try {
      const res = await fetch("/api/billing/me", { cache: "no-store" });
      if (!res.ok) return;
      const d = await res.json();
      set({
        authed: !!d.authed,
        plan: d.plan ?? "free",
        status: d.status ?? "active",
        balance: d.balance ?? 0,
        purchased: d.purchased ?? 0,
        monthlyGrant: d.monthlyGrant ?? 0,
        periodEnd: d.periodEnd ?? null,
        autoReload: d.autoReload ?? { enabled: false, threshold: 100, amountCents: 1000 },
        loaded: true,
      });
      // After every balance refresh, top up automatically if the user opted in and
      // dropped below their threshold (server is authoritative; this is a no-op
      // otherwise, and the cooldown/lock prevent any double-charge).
      void get().maybeAutoReload();
    } catch {
      /* ignore — the chip just stays as-is */
    }
  },

  openUpgrade: () => set({ upgradeOpen: true }),
  closeUpgrade: () => set({ upgradeOpen: false }),
  openCredit: () => set({ creditOpen: true, upgradeOpen: false }),
  closeCredit: () => set({ creditOpen: false }),
  setNotice: (s) => set({ notice: s }),

  startCheckout: async (plan, interval = "monthly") => {
    set({ busyPlan: plan });
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan, interval }),
      });
      if (res.status === 401) {
        const { useClunoid } = await import("@/lib/store/useClunoid");
        useClunoid.getState().openAuth("login");
        return;
      }
      const d = await res.json().catch(() => null);
      if (res.ok && d?.url) window.location.href = d.url;
      else set({ notice: "Couldn't start checkout — please try again." });
    } catch {
      set({ notice: "Couldn't start checkout — please try again." });
    } finally {
      set({ busyPlan: null });
    }
  },

  openPortal: async () => {
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const d = await res.json().catch(() => null);
      if (res.ok && d?.url) window.location.href = d.url;
      else set({ notice: "No subscription to manage yet." });
    } catch {
      set({ notice: "Couldn't open the billing portal." });
    }
  },

  // Buy credits: start a custom-amount Polar checkout (min $5) and redirect to it.
  buyCredits: async (amountCents: number) => {
    set({ buyingCredits: true });
    try {
      const res = await fetch("/api/billing/topup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountCents }),
      });
      if (res.status === 401) {
        const { useClunoid } = await import("@/lib/store/useClunoid");
        useClunoid.getState().openAuth("login");
        return;
      }
      const d = await res.json().catch(() => null);
      if (res.ok && d?.url) window.location.href = d.url;
      else set({ notice: d?.error === "min" ? "Minimum top-up is $5." : "Couldn't start the purchase — please try again." });
    } catch {
      set({ notice: "Couldn't start the purchase — please try again." });
    } finally {
      set({ buyingCredits: false });
    }
  },

  // Save auto-reload preferences (server clamps to the $5 min + sanity caps).
  saveAutoReload: async (cfg: AutoReload) => {
    try {
      const res = await fetch("/api/billing/auto-reload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cfg),
      });
      const d = await res.json().catch(() => null);
      if (res.ok && d?.ok) {
        set({ autoReload: { enabled: !!d.enabled, threshold: d.threshold, amountCents: d.amountCents } });
        return true;
      }
      set({ notice: "Couldn't save auto-reload — please try again." });
      return false;
    } catch {
      set({ notice: "Couldn't save auto-reload — please try again." });
      return false;
    }
  },

  // Fire an off-session auto-reload if eligible. Cheap no-op when not (server is
  // authoritative); after a successful charge, credits land via the webhook so we
  // refresh a couple of times to reflect them.
  maybeAutoReload: async () => {
    const s = get();
    if (!s.authed || !s.autoReload.enabled || s.balance >= s.autoReload.threshold || reloadInFlight) return;
    reloadInFlight = true;
    try {
      const res = await fetch("/api/billing/auto-reload/run", { method: "POST" });
      const d = await res.json().catch(() => null);
      if (d?.reloaded) {
        setTimeout(() => void get().refresh(), 3000);
        setTimeout(() => void get().refresh(), 8000);
      }
    } catch {
      /* ignore — auto-reload is best-effort */
    } finally {
      reloadInFlight = false;
    }
  },
}));
