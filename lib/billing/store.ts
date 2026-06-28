"use client";

import { create } from "zustand";

type BillingState = {
  authed: boolean;
  plan: string;
  status: string;
  balance: number;
  monthlyGrant: number;
  periodEnd: string | null;
  loaded: boolean;
  upgradeOpen: boolean;
  notice: string | null;
  busyPlan: string | null;
  refresh: () => Promise<void>;
  openUpgrade: () => void;
  closeUpgrade: () => void;
  setNotice: (s: string | null) => void;
  startCheckout: (plan: "pro" | "max") => Promise<void>;
  openPortal: () => Promise<void>;
};

export const useBilling = create<BillingState>((set) => ({
  authed: false,
  plan: "free",
  status: "active",
  balance: 0,
  monthlyGrant: 0,
  periodEnd: null,
  loaded: false,
  upgradeOpen: false,
  notice: null,
  busyPlan: null,

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
        monthlyGrant: d.monthlyGrant ?? 0,
        periodEnd: d.periodEnd ?? null,
        loaded: true,
      });
    } catch {
      /* ignore — the chip just stays as-is */
    }
  },

  openUpgrade: () => set({ upgradeOpen: true }),
  closeUpgrade: () => set({ upgradeOpen: false }),
  setNotice: (s) => set({ notice: s }),

  startCheckout: async (plan) => {
    set({ busyPlan: plan });
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan }),
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
}));
