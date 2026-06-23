"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { IsaacOrb } from "@/components/stage/IsaacOrb";

/**
 * Set a new password after following the reset link. The recovery code is
 * exchanged for a session by /auth/callback (which redirects here), so on mount
 * the user has a short-lived recovery session that authorizes updateUser().
 */
export default function ResetPassword() {
  const router = useRouter();
  const [ready, setReady] = useState<"checking" | "ok" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // A valid recovery link establishes a session; if there isn't one, the link is
  // missing/expired.
  useEffect(() => {
    const supabase = getSupabaseBrowser();
    supabase.auth.getSession().then(({ data }) => {
      setReady(data.session ? "ok" : "invalid");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) setReady("ok");
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const supabase = getSupabaseBrowser();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      // They're signed in now — send them into the app.
      setTimeout(() => router.replace("/"), 1400);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Couldn't update your password.");
      setBusy(false);
    }
  }

  return (
    <main className="stage-bg grid min-h-[100dvh] place-items-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex w-full max-w-sm flex-col items-center text-center"
      >
        <IsaacOrb size={110} />

        {ready === "checking" && <p className="mt-6 text-ink-muted">One moment…</p>}

        {ready === "invalid" && (
          <>
            <h1 className="mt-6 font-serif text-2xl text-ink">This link has expired</h1>
            <p className="mt-2 text-sm text-ink-muted">
              Reset links are single-use and time-limited. Head back and request a new one.
            </p>
            <button
              onClick={() => router.replace("/")}
              className="mt-6 rounded-full bg-clay px-6 py-3 font-medium text-[#1F1E1C] shadow-glow transition hover:bg-clay-soft"
            >
              Back to Clunoid
            </button>
          </>
        )}

        {ready === "ok" && !done && (
          <>
            <h1 className="mt-6 font-serif text-2xl text-ink">Choose a new password</h1>
            <form onSubmit={submit} className="mt-5 flex w-full flex-col gap-3">
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="New password"
                  required
                  minLength={6}
                  autoFocus
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-border bg-base px-4 py-3 pr-11 text-ink outline-none placeholder:text-ink-faint focus:border-clay"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
                  aria-label={showPass ? "Hide password" : "Show password"}
                >
                  {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {msg && <p className="text-sm text-clay-soft">{msg}</p>}
              <button
                type="submit"
                disabled={busy}
                className="mt-1 rounded-xl bg-clay px-4 py-3 font-medium text-[#1F1E1C] transition hover:bg-clay-soft disabled:opacity-60"
              >
                {busy ? "Updating…" : "Update password"}
              </button>
            </form>
          </>
        )}

        {done && (
          <>
            <h1 className="mt-6 font-serif text-2xl text-ink">Password updated</h1>
            <p className="mt-2 text-sm text-ink-muted">Taking you in…</p>
          </>
        )}
      </motion.div>
    </main>
  );
}
