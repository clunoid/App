"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X, Eye, EyeOff } from "lucide-react";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { useClunoid } from "@/lib/store/useClunoid";
import { formatName } from "@/lib/utils";

const EMAIL_KEY = "clunoid_email";

const displayNameOf = (u: User): string | undefined =>
  (u.user_metadata?.name as string) || (u.user_metadata?.full_name as string) || undefined;

/**
 * Sign up / sign in with email+password or Google. Smooth, provider-aware:
 * - last-used email is remembered and pre-filled,
 * - if an email already has an account, we route to the RIGHT method
 *   (auto-send Google-only users to Google; sign password users straight in;
 *   send genuinely new emails to sign-up),
 * - forgot-password reset is built in.
 * The modal unmounts instantly when closed (it's mounted once above the
 * gate/live branches, so an exit animation can't leave a click-blocking overlay).
 */
export function AuthPrompt() {
  const open = useClunoid((s) => s.authOpen);
  const mode = useClunoid((s) => s.authMode);
  const close = useClunoid((s) => s.closeAuth);
  const setUser = useClunoid((s) => s.setUser);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showReset, setShowReset] = useState(false);

  // Pre-fill the remembered email when the modal opens.
  useEffect(() => {
    if (open) {
      setMsg(null);
      setShowReset(false);
      try {
        const saved = localStorage.getItem(EMAIL_KEY);
        if (saved) setEmail(saved);
      } catch {
        /* ignore */
      }
    }
  }, [open]);

  function remember(value: string) {
    try {
      localStorage.setItem(EMAIL_KEY, value);
    } catch {
      /* ignore */
    }
  }

  async function withGoogle() {
    setBusy(true);
    setMsg(null);
    try {
      const supabase = getSupabaseBrowser();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      // Redirects to Google; the callback route finishes sign-in.
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Google sign-in failed.");
      setBusy(false);
    }
  }

  function finishAuth(authUser: User, display: string | undefined) {
    remember(email.trim().toLowerCase());
    setUser({
      id: authUser.id,
      name: display ? formatName(display) : undefined,
      email: authUser.email,
      avatarUrl:
        (authUser.user_metadata?.avatar_url as string) || (authUser.user_metadata?.picture as string) || undefined,
      createdAt: authUser.created_at,
      isAuthed: true,
    });
    close();
    // Signed in — the "/" route guard now forwards them to /home.
  }

  /**
   * Sign-up hit an existing email. Try the password they entered (covers people
   * who already have a password account and used the wrong form), otherwise
   * route them to a working method. We deliberately do NOT probe which provider
   * the email uses — that would leak account information (enumeration). The safe
   * options (Google button, password reset) are surfaced instead.
   */
  async function resolveExisting(supabase: SupabaseClient, addr: string, signupName?: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email: addr, password });
    if (!error && data.user) {
      finishAuth(data.user, displayNameOf(data.user) || signupName);
      return;
    }
    useClunoid.getState().openAuth("login");
    setShowReset(true);
    setMsg(
      "This email already has an account. If you signed up with Google, use 'Continue with Google' above — otherwise reset your password below."
    );
    setBusy(false);
  }

  async function sendReset() {
    const addr = email.trim().toLowerCase();
    if (!addr) {
      setMsg("Enter your email above first, then tap reset.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const supabase = getSupabaseBrowser();
      const { error } = await supabase.auth.resetPasswordForEmail(addr, {
        redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset`,
      });
      if (error) throw error;
      remember(addr);
      setMsg("Check your email for a link to reset your password.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Couldn't send the reset email.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const supabase = getSupabaseBrowser();
    const addr = email.trim().toLowerCase();

    try {
      if (mode === "signup") {
        const cleanName = formatName(name);
        const { data, error } = await supabase.auth.signUp({
          email: addr,
          password,
          options: { data: { name: cleanName } },
        });
        if (error) {
          if (/already.*regist|already.*exist|already been/i.test(error.message)) {
            await resolveExisting(supabase, addr, cleanName);
            return;
          }
          throw error;
        }
        if (data.user) {
          // If email confirmation is enabled, signUp returns a user but NO
          // session — don't pretend they're in. (Clunoid uses instant accounts,
          // so this only shows if confirmations are turned on.)
          if (!data.session) {
            setMsg("Almost there — check your email to confirm your account, then sign in.");
            setBusy(false);
            return;
          }
          // The DB trigger creates the profile; this upsert keeps the tidy name.
          void supabase.from("profiles").upsert({ id: data.user.id, display_name: cleanName });
          finishAuth(data.user, cleanName);
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: addr, password });
        if (error) {
          if (/invalid login credentials/i.test(error.message)) {
            // Don't reveal whether the email exists or how it's registered.
            setShowReset(true);
            setMsg(
              "We couldn't sign you in. Check your password or reset it below — or if you signed up with Google, use 'Continue with Google' above. New here? Create an account."
            );
            setBusy(false);
            return;
          }
          throw error;
        }
        finishAuth(data.user, displayNameOf(data.user));
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={close}
    >
      <motion.div
        className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-soft"
        initial={{ scale: 0.95, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-xl text-ink">
            {mode === "signup" ? "Let's get you set up" : "Welcome back"}
          </h2>
          <button onClick={close} className="text-ink-faint hover:text-ink" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <button
          type="button"
          onClick={withGoogle}
          disabled={busy}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-base px-4 py-3 font-medium text-ink transition hover:bg-surface-2 disabled:opacity-60"
        >
          <GoogleIcon /> Continue with Google
        </button>

        <div className="mb-4 flex items-center gap-3 text-xs text-ink-faint">
          <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          {mode === "signup" && (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setName((n) => formatName(n))}
              placeholder="What should Isaac call you?"
              required
              autoComplete="name"
              className="rounded-xl border border-border bg-base px-4 py-3 text-ink outline-none placeholder:text-ink-faint focus:border-clay"
            />
          )}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            autoComplete="email"
            className="rounded-xl border border-border bg-base px-4 py-3 text-ink outline-none placeholder:text-ink-faint focus:border-clay"
          />
          <div className="relative">
            <input
              type={showPass ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
              minLength={6}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              autoFocus={!!email}
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

          {(mode === "login" || showReset) && (
            <button
              type="button"
              onClick={sendReset}
              disabled={busy}
              className="-mt-1 self-end text-xs text-ink-faint transition hover:text-clay-soft disabled:opacity-60"
            >
              Forgot password?
            </button>
          )}

          {msg && <p className="text-sm text-clay-soft">{msg}</p>}

          <button
            type="submit"
            disabled={busy}
            className="mt-1 rounded-xl bg-clay px-4 py-3 font-medium text-[#1F1E1C] transition hover:bg-clay-soft disabled:opacity-60"
          >
            {busy
              ? mode === "signup"
                ? "Creating account…"
                : "Signing in…"
              : mode === "signup"
              ? "Create account"
              : "Sign in"}
          </button>
        </form>

        <button
          onClick={() => useClunoid.getState().openAuth(mode === "signup" ? "login" : "signup")}
          className="mt-4 w-full text-center text-sm text-ink-faint hover:text-ink"
        >
          {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
        </button>
      </motion.div>
    </motion.div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.5 0 10.4-2.1 14.1-5.5l-6.5-5.5C29.6 34.6 26.9 36 24 36c-5.2 0-9.6-3.3-11.2-7.9l-6.6 5.1C9.6 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.5 5.5C40.9 36.5 44 30.8 44 24c0-1.3-.1-2.3-.4-3.5z" />
    </svg>
  );
}
