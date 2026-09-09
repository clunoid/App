"use client";

/**
 * GETTING THE GENERAL MT5 EA.
 *
 * The button used to be a link straight to the file. It is a request now,
 * because the EA is not a standalone robot: it asks clunoid.com for its signals
 * on every bar, and that engine runs for the trading community rather than for
 * whoever finds the page.
 *
 * Four steps, and the order matters — an account first, because everything
 * after it is about that account; then the ID, so it can be checked; then a
 * name and an email, so there is a way to answer; then the code.
 *
 * Between step three and step four somebody has to look at a list on Deriv. So
 * the wait is real, and the design says so rather than spinning: the request
 * goes into the same support conversation the site already has, the bubble
 * opens, and the code arrives there as a reply.
 */

import { useCallback, useEffect, useState } from "react";
import { X, Check, Loader2, Download, ExternalLink, ShieldCheck } from "lucide-react";
import { TC } from "@/lib/trading/theme";
import { loadIdentity, saveIdentity } from "@/lib/support/identity";

const DERIV_SIGNUP = "https://t.deriv.link?t=8FJ7FBEALQBP";
const PARTNER_ID = "019cafdd-b40f-7552-83a9-a0d5d69125d5";

/* Not the tracking link: that one always lands on /dashboard/signup no matter
   what you pass it, so it would send somebody with an account to a signup form
   for one they already have. The token rides on the real page instead. */
const DERIV_PROFILE = "https://home.deriv.com/dashboard/profile?t=8FJ7FBEALQBP";
const EXAMPLE_CLIENT_ID = "019cafdd-b40f-7552-83a9-a0d5d69125d5";

type Phase = "form" | "sent" | "done";

export function EaAccessModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [visitorId, setVisitorId] = useState("");
  const [clientId, setClientId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /* The same browser id support uses, so the request joins that conversation
     rather than starting an anonymous second one. */
  useEffect(() => {
    if (!open) return;
    const id = loadIdentity();
    setVisitorId(id.visitorId);
    if (id.name && !name) setName(id.name);
    if (id.email && !email) setEmail(id.email);
  }, [open, name, email]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const send = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/trading/mt5/ea-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitorId, mt5Login: clientId.trim(), name: name.trim(), email: email.trim(),
          page: typeof window !== "undefined" ? window.location.pathname : "",
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error || "Could not send that. Try again in a moment.");

      saveIdentity({ name: name.trim(), email: email.trim() });
      setPhase("sent");

      /* Hand the bubble what was just sent, so it opens onto the conversation
         with the request already in it and the name and email filled in —
         rather than onto an empty window that gives no sign anything happened.
         The answer arrives in this same thread. */
      window.dispatchEvent(new CustomEvent("clunoid:support-open", {
        detail: {
          name: name.trim(),
          email: email.trim(),
          text: `Requested the General MT5 EA — client / MT5 ID ${clientId.trim()}.`,
        },
      }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send that.");
    } finally { setBusy(false); }
  }, [visitorId, clientId, name, email]);

  const redeem = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/trading/mt5/ea-download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim(), visitorId }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || "That code was not accepted.");
      }
      /* The file comes back as bytes, so the save has to be made to happen. */
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "ClunoidMT5.mq5";
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      setPhase("done");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That code was not accepted.");
    } finally { setBusy(false); }
  }, [code, visitorId]);

  if (!open) return null;

  /* The same two shapes the server accepts: a UUID client ID, or a short
     numeric MT5 ID. They have to agree, or the button greys out on something
     the server would have taken. */
  const idOk = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId.trim())
    || /^[0-9]{4,12}$/.test(clientId.trim());
  const formOk = idOk && name.trim().length > 1 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center overflow-y-auto p-0 sm:items-center sm:p-6"
      style={{ background: "rgba(3,6,12,0.72)", backdropFilter: "blur(6px)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Get the Clunoid MT5 EA"
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-t-2xl border sm:rounded-2xl"
        style={{ borderColor: TC.line, background: TC.panel, boxShadow: "0 24px 60px rgba(0,0,0,0.5)" }}
      >
        <header className="flex items-start gap-3 border-b p-5" style={{ borderColor: TC.line }}>
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-bold" style={{ color: TC.text }}>Get the Clunoid EA</h2>
            <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
              The EA runs on <b style={{ color: TC.text }}>clunoid.com technology</b> — it asks our trading engine
              for its signals as it trades. We share it with our own community only, so there are
              a few steps first.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border"
            style={{ borderColor: TC.line, color: TC.muted }}>
            <X size={15} />
          </button>
        </header>

        <div className="max-h-[70vh] overflow-y-auto p-5">
          {phase === "done" ? (
            <div className="text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full" style={{ background: "rgba(34,197,94,0.15)" }}>
                <Check size={22} style={{ color: TC.profit }} />
              </div>
              <h3 className="mt-3 text-[15px] font-bold" style={{ color: TC.text }}>Downloaded</h3>
              <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
                ClunoidMT5.mq5 is in your downloads. Follow the install steps on this page next.
                Keep your code — it works again on this browser if you need the file later.
              </p>
              <button type="button" onClick={onClose}
                className="mt-4 rounded-xl px-4 py-2.5 text-[13px] font-semibold"
                style={{ background: TC.profit, color: TC.ink }}>Done</button>
            </div>
          ) : (
            <>
              <Step n={1} title="Open an MT5 account with Deriv" done={phase === "sent"}>
                <p className="text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
                  Already have one under Clunoid? Skip to step 2.
                </p>
                <a href={DERIV_SIGNUP} target="_blank" rel="noopener noreferrer"
                  className="mt-2.5 inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[12.5px] font-semibold transition hover:bg-white/5"
                  style={{ borderColor: TC.line, color: TC.text }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logos/metatrader5.svg" alt="MetaTrader 5" className="h-4 w-auto" style={{ maxWidth: 108 }} />
                  <span>Create account</span>
                  <ExternalLink size={13} style={{ color: TC.faint }} />
                </a>
              </Step>

              <Step n={2} title="Client ID or MT5 ID" done={phase === "sent"}>
                <input
                  value={clientId} onChange={(e) => setClientId(e.target.value)}
                  placeholder={EXAMPLE_CLIENT_ID} disabled={phase === "sent"}
                  className="w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none"
                  style={{ borderColor: TC.line, background: TC.bg, color: TC.text }}
                />
                <p className="mt-1.5 text-[11.5px] leading-relaxed" style={{ color: TC.faint }}>
                  Either works. A <b style={{ color: TC.muted }}>client ID</b> looks like the example
                  above; an <b style={{ color: TC.muted }}>MT5 ID</b> is a short run of digits. Not your email.
                </p>
                <a href={DERIV_PROFILE} target="_blank" rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] font-semibold underline underline-offset-2"
                  style={{ color: TC.profit }}>
                  Copy it from your Deriv profile <ExternalLink size={11} />
                </a>
              </Step>

              <Step n={3} title="Name and email" done={phase === "sent"}>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input value={name} onChange={(e) => setName(e.target.value)}
                    placeholder="Your name" disabled={phase === "sent"}
                    className="w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none"
                    style={{ borderColor: TC.line, background: TC.bg, color: TC.text }} />
                  <input value={email} onChange={(e) => setEmail(e.target.value)}
                    type="email" placeholder="you@email.com" disabled={phase === "sent"}
                    className="w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none"
                    style={{ borderColor: TC.line, background: TC.bg, color: TC.text }} />
                </div>
                <p className="mt-1.5 text-[11.5px]" style={{ color: TC.faint }}>
                  So we can reach you about this account. Nothing else.
                </p>

                {phase === "form" && (
                  <button type="button" onClick={send} disabled={!formOk || busy}
                    className="mt-3 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition disabled:opacity-45"
                    style={{ background: TC.profit, color: TC.ink }}>
                    {busy ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
                    Send for checking
                  </button>
                )}
              </Step>

              {phase === "sent" && (
                <div className="mb-4 rounded-xl border p-3.5 text-[12.5px] leading-relaxed"
                  style={{ borderColor: "rgba(34,197,94,0.35)", background: "rgba(34,197,94,0.08)", color: TC.text }}>
                  <b>Sent.</b> We are checking your ID against our community list now.
                  Your code arrives in the <b>support window</b> — it has opened at the corner of
                  this page, and the reply lands there.
                </div>
              )}

              <Step n={4} title="Enter your download code" done={false}>
                <div className="flex flex-wrap gap-2">
                  <input value={code} onChange={(e) => setCode(e.target.value)}
                    placeholder="CLU-XXXX-XXXX"
                    className="min-w-0 flex-1 rounded-xl border px-3 py-2.5 text-[13px] uppercase outline-none"
                    style={{ borderColor: TC.line, background: TC.bg, color: TC.text, letterSpacing: "0.06em" }} />
                  <button type="button" onClick={redeem} disabled={!code.trim() || busy}
                    className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition disabled:opacity-45"
                    style={{ background: TC.profit, color: TC.ink }}>
                    {busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                    Download
                  </button>
                </div>
                <p className="mt-1.5 text-[11.5px]" style={{ color: TC.faint }}>
                  Your code only works on this browser.
                </p>
              </Step>

              {err && (
                <div className="mt-1 rounded-xl border p-3 text-[12.5px]"
                  style={{ borderColor: "rgba(242,96,125,0.4)", background: "rgba(242,96,125,0.08)", color: TC.loss }}>
                  {err}
                </div>
              )}

              <p className="mt-4 border-t pt-3.5 text-[11.5px] leading-relaxed" style={{ borderColor: TC.line, color: TC.faint }}>
                We check every ID against our Deriv partner list. If yours is not under us,
                we will say so and ask you to contact Deriv support to be added under{" "}
                <code className="rounded px-1 py-0.5" style={{ background: TC.bg, color: TC.muted }}>{PARTNER_ID}</code>{" "}
                — then reply in the support window and we will check again.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Step({ n, title, done, children }: {
  n: number; title: string; done: boolean; children: React.ReactNode;
}) {
  return (
    <section className="mb-4">
      <div className="mb-2 flex items-center gap-2.5">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11.5px] font-bold"
          style={done
            ? { background: "rgba(34,197,94,0.18)", color: TC.profit }
            : { background: "rgba(56,189,248,0.16)", color: TC.profit }}>
          {done ? <Check size={13} /> : n}
        </span>
        <h3 className="text-[13.5px] font-semibold" style={{ color: TC.text }}>{title}</h3>
      </div>
      <div className="pl-[34px]">{children}</div>
    </section>
  );
}
