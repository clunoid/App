"use client";

import Link from "next/link";
import { useClunoid } from "@/lib/store/useClunoid";
import { cn } from "@/lib/utils";

/**
 * Call-to-action used across the public marketing pages. It opens the sign-in /
 * sign-up modal (openAuth) — it never links straight into the authenticated app,
 * so a visitor arriving from a search result still has to create an account.
 * Signed-in visitors are sent to /home instead.
 */
export function StartFree({
  label = "Start free",
  className,
  variant = "primary",
}: {
  label?: string;
  className?: string;
  variant?: "primary" | "ghost";
}) {
  const isAuthed = useClunoid((s) => s.user.isAuthed);
  const openAuth = useClunoid((s) => s.openAuth);

  const base =
    "inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold transition";
  const styles =
    variant === "primary"
      ? "bg-clay text-[#1F1E1C] shadow-glow hover:bg-clay-soft"
      : "border border-border bg-surface/70 text-ink hover:border-clay hover:text-ink";

  // Signed-in → straight to the app; signed-out → open the auth modal in place.
  if (isAuthed) {
    return (
      <Link href="/home" className={cn(base, styles, className)}>
        {label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={() => openAuth("signup")} className={cn(base, styles, className)}>
      {label}
    </button>
  );
}
