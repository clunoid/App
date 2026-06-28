"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { LogOut, MapPin, CalendarDays, Zap, CreditCard, Sparkles } from "lucide-react";
import { useClunoid } from "@/lib/store/useClunoid";
import { useBilling } from "@/lib/billing/store";
import { cn, formatName } from "@/lib/utils";

/**
 * A friendly "City, Region" from the browser's time zone — no permission prompt.
 * Both parts come from the SAME source (the IANA zone, e.g. "Africa/Nairobi" →
 * "Nairobi, Africa") so they never disagree the way zone + locale-country can.
 */
function useLocation(): string | null {
  const [loc, setLoc] = useState<string | null>(null);
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; // "Africa/Nairobi"
      const segs = tz.split("/");
      const city = segs.pop()?.replace(/_/g, " ");
      const region = segs[0] && segs[0] !== "Etc" ? segs[0].replace(/_/g, " ") : undefined;
      const value = [city, region].filter(Boolean).join(", ");
      if (value) setLoc(value);
    } catch {
      /* time zone unavailable */
    }
  }, []);
  return loc;
}

/**
 * Top-right profile. Signed-out users see a "Sign in" pill; signed-in users see
 * a colored avatar that opens a small card with their name, email, and join
 * date. Closes on outside click (and auto-closes when Isaac pops it open).
 */
export function ProfileMenu() {
  const user = useClunoid((s) => s.user);
  const open = useClunoid((s) => s.profileOpen);
  const openProfile = useClunoid((s) => s.openProfile);
  const closeProfile = useClunoid((s) => s.closeProfile);
  const signOut = useClunoid((s) => s.signOut);
  const openAuth = useClunoid((s) => s.openAuth);
  const balance = useBilling((s) => s.balance);
  const plan = useBilling((s) => s.plan);
  const billingLoaded = useBilling((s) => s.loaded);
  const openPortal = useBilling((s) => s.openPortal);
  const location = useLocation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) closeProfile();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, closeProfile]);

  if (!user.isAuthed) {
    return (
      <button
        onClick={() => openAuth("login")}
        className="rounded-full border border-border bg-surface px-4 py-1.5 text-sm text-ink transition hover:bg-surface-2"
      >
        Sign in
      </button>
    );
  }

  const initial = (user.name || user.email || "?").trim()[0]?.toUpperCase() ?? "?";
  const joined = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    : null;

  const planLabel = plan === "max" ? "Max" : plan === "pro" ? "Pro" : "Free";

  return (
    <div className="flex items-center gap-2">
      {billingLoaded && (
        <Link
          href="/pricing"
          title="Credits — view plans"
          className="flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-sm font-medium text-clay-soft transition hover:bg-surface-2"
        >
          <Zap size={13} className="text-clay" /> {balance}
        </Link>
      )}
      <div ref={ref} className="relative">
        <button
          onClick={() => (open ? closeProfile() : openProfile())}
          className="h-9 w-9 overflow-hidden rounded-full shadow-glow transition hover:brightness-105"
          aria-label="Your profile"
        >
          <Avatar url={user.avatarUrl} initial={initial} />
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.96 }}
              transition={{ duration: 0.18 }}
              className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-2xl border border-border bg-surface shadow-soft"
            >
              <div className="bg-gradient-to-br from-clay/25 to-spark/15 p-4">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full">
                    <Avatar url={user.avatarUrl} initial={initial} big />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-medium text-ink">{formatName(user.name) || "You"}</div>
                    <div className="truncate text-xs text-ink-muted">{user.email}</div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col p-3 text-sm">
                <div className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5">
                  <span className="flex items-center gap-1.5 text-ink-faint">
                    <Sparkles size={14} /> Plan
                  </span>
                  <span className="font-medium text-spark-soft">{planLabel}</span>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5">
                  <span className="flex items-center gap-1.5 text-ink-faint">
                    <Zap size={14} /> Credits
                  </span>
                  <span className="font-medium text-clay-soft">{balance}</span>
                </div>
                {location && (
                  <div className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5">
                    <span className="flex items-center gap-1.5 text-ink-faint">
                      <MapPin size={14} /> Location
                    </span>
                    <span className="truncate font-medium text-clay-soft">{location}</span>
                  </div>
                )}
                {joined && (
                  <div className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5">
                    <span className="flex items-center gap-1.5 text-ink-faint">
                      <CalendarDays size={14} /> Joined
                    </span>
                    <span className="font-medium text-spark-soft">{joined}</span>
                  </div>
                )}
                {plan === "free" ? (
                  <Link
                    href="/pricing"
                    onClick={closeProfile}
                    className="mt-1 flex items-center gap-2 rounded-lg px-2 py-2 text-clay-soft transition hover:bg-surface-2"
                  >
                    <CreditCard size={16} /> Upgrade plan
                  </Link>
                ) : (
                  <button
                    onClick={() => {
                      closeProfile();
                      void openPortal();
                    }}
                    className="mt-1 flex items-center gap-2 rounded-lg px-2 py-2 text-spark-soft transition hover:bg-surface-2"
                  >
                    <CreditCard size={16} /> Manage subscription
                  </button>
                )}
                <button
                  onClick={() => signOut()}
                  className="mt-1 flex items-center gap-2 rounded-lg px-2 py-2 text-bad transition hover:bg-surface-2"
                >
                  <LogOut size={16} /> Sign out
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** Google profile photo when available, otherwise a colored initial. */
function Avatar({ url, initial, big }: { url?: string; initial: string; big?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (url && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover"
      />
    );
  }
  return (
    <span
      className={cn(
        "grid h-full w-full place-items-center bg-gradient-to-br from-clay-soft to-clay font-semibold text-[#1F1E1C]",
        big ? "text-base" : "text-sm"
      )}
    >
      {initial}
    </span>
  );
}
