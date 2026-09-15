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
import { X, Check, Loader2, Download, ExternalLink, ShieldCheck, Gift } from "lucide-react";
import { TC } from "@/lib/trading/theme";
import { loadIdentity, saveIdentity } from "@/lib/support/identity";
import { tm, useLang } from "@/lib/i18n/t";

/** The community, for the minutes between sending and the reply. */
const WHATSAPP_CHANNEL = "https://whatsapp.com/channel/0029Vb6sxFG9xVJWbyIwL110";
const TELEGRAM_CHANNEL = "https://t.me/magicabofficialchannel";
const waitRow = "flex items-center gap-3 rounded-xl border px-3 py-2.5 no-underline transition hover:bg-white/5";

function WhatsAppMark({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path fill="#25D366" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2z" />
      <path fill="#fff" d="M9.2 7.4c-.2-.5-.4-.5-.6-.5h-.5c-.2 0-.5.1-.7.3-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.2 5 4.4 2.5 1 3 .8 3.5.7.5-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3l-2-1c-.3-.1-.5-.1-.7.1-.2.3-.8 1-1 1.2-.2.2-.3.2-.6.1-.3-.2-1.2-.5-2.3-1.5-.9-.8-1.5-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.5.3-.5c.1-.2 0-.4 0-.5l-1-2.2z" />
    </svg>
  );
}
function TelegramMark({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="#2AABEE" />
      <path fill="#fff" d="M6.1 11.7l9.3-3.6c.4-.2.8.1.7.7l-1.6 7.4c-.1.5-.4.6-.8.4l-2.3-1.7-1.1 1.1c-.1.1-.2.2-.5.2l.2-2.4 4.3-3.9c.2-.2 0-.3-.3-.1l-5.3 3.3-2.3-.7c-.5-.2-.5-.5.1-.7z" />
    </svg>
  );
}

/* The broker moved from Deriv to Headway. BROKER decides which step 1 is
   drawn; the Deriv step and its values are kept so the switch back is one
   word. */
const BROKER: "headway" | "deriv" = "headway";
const DERIV_SIGNUP = "https://t.deriv.link?t=8FJ7FBEALQBP";
const DERIV_PARTNER_ID = "019cafdd-b40f-7552-83a9-a0d5d69125d5";
const DERIV_PROFILE = "https://home.deriv.com/dashboard/profile";
const DERIV_EXAMPLE_ID = "019cafdd-b40f-7552-83a9-a0d5d69125d5";

/** Headway: the sign-up link carries its own token (hwp=8abf6d); the Partner
    ID is what Headway support asks for. */
const HEADWAY_SIGNUP = "https://headway.partners/user/signup?hwp=8abf6d";
const PARTNER_ID = "6078336";
const EXAMPLE_CLIENT_ID = "1234567";

type Phase = "form" | "sent" | "done";

/* ── how many more times they may send ──────────────────────────────────
   A mistake in the ID is fixed by editing and sending again, so nothing is
   locked after a send. A script hammering the form is another matter: three
   sends, then a wait for our answer — and any reply from us in the support
   thread, arriving after the last send, resets the count. The thread is what
   the bubble keeps in this browser, so this needs no extra call. */
const SENDS_KEY = "cln_ea_sends";
const THREAD_KEY = "cln_support_thread";
const MAX_SENDS = 3;
type Sends = { n: number; at: string };
function readSends(): Sends {
  try { const v = JSON.parse(localStorage.getItem(SENDS_KEY) || "null") as Sends | null; if (v && typeof v.n === "number") return v; } catch { /* private mode */ }
  return { n: 0, at: "" };
}
function repliedSince(iso: string): boolean {
  if (!iso) return false;
  try {
    const thread = JSON.parse(localStorage.getItem(THREAD_KEY) || "[]") as { from?: string; system?: boolean; at?: string }[];
    return thread.some((l) => l && l.from === "us" && !l.system && String(l.at || "") > iso);
  } catch { return false; }
}
function sendsLeft(): number {
  let v = readSends();
  if (v.n > 0 && repliedSince(v.at)) { v = { n: 0, at: "" }; try { localStorage.setItem(SENDS_KEY, JSON.stringify(v)); } catch { /* private mode */ } }
  return Math.max(0, MAX_SENDS - v.n);
}
function countSend() {
  const v = readSends();
  try { localStorage.setItem(SENDS_KEY, JSON.stringify({ n: v.n + 1, at: new Date().toISOString() })); } catch { /* private mode */ }
}

export function EaAccessModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [visitorId, setVisitorId] = useState("");
  const [clientId, setClientId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  /* The wait card: opened by a successful send, and again from the note. */
  const [waitOpen, setWaitOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useLang(); // a server error on screen changes language with the page
  const [left, setLeft] = useState(MAX_SENDS);

  /* Re-read the allowance when the modal opens and whenever the bubble
     receives a reply — that is the moment a locked form unlocks. */
  useEffect(() => {
    if (!open) return;
    const sync = () => setLeft(sendsLeft());
    sync();
    window.addEventListener("clunoid:support-reply", sync);
    return () => window.removeEventListener("clunoid:support-reply", sync);
  }, [open]);

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
    if (sendsLeft() === 0) { setLeft(0); return; }
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
      countSend();
      setLeft(sendsLeft());
      setPhase("sent");
      setWaitOpen(true);

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

  /* Only that they typed something. Client IDs come in more than one shape, so
     any check tighter than this greys the button out on a real one. */
  const idOk = clientId.trim().length > 0;
  const formOk = idOk && name.trim().length > 1 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

  return (
    <>
    {waitOpen && (
      /* ── while you wait ─────────────────────────────────────────────────
         Three doors: the Headway bonus to claim now, and the two channels
         where the community lives. */
      <div className="fixed inset-0 z-[130] flex items-center justify-center p-4"
        style={{ background: "rgba(3,6,12,0.72)", backdropFilter: "blur(6px)" }}
        onMouseDown={(e) => { if (e.target === e.currentTarget) setWaitOpen(false); }}
        role="dialog" aria-modal="true" aria-label="While you wait">
        <div className="relative w-full max-w-[400px] rounded-2xl border px-4 pb-4 pt-6 text-center"
          style={{ borderColor: TC.line, background: TC.bg, boxShadow: "0 24px 60px rgba(0,0,0,0.5)" }}>
          <button type="button" onClick={() => setWaitOpen(false)} aria-label="Close"
            className="absolute right-2.5 top-2.5 grid h-8 w-8 place-items-center rounded-lg border"
            style={{ borderColor: TC.line, color: TC.muted }}>
            <X size={15} />
          </button>
          <div className="mx-auto grid h-11 w-11 place-items-center rounded-full" style={{ background: "rgba(34,197,94,0.15)" }}>
            <Check size={22} style={{ color: "#22c55e" }} />
          </div>
          <h3 className="mt-2.5 text-[17px] font-bold" style={{ color: TC.text }}>Sent — we are checking now</h3>
          <p className="mb-3.5 mt-1.5 text-[12.5px] leading-snug" style={{ color: TC.muted }}>Your code lands in the support window. While you wait:</p>
          <div className="grid gap-2 text-left">
            <a href={HEADWAY_SIGNUP} target="_blank" rel="noopener noreferrer sponsored" className={waitRow}
              style={{ borderColor: "rgba(56,189,248,0.55)", background: "rgba(56,189,248,0.10)", color: TC.profit }}>
              <Gift size={18} className="shrink-0" />
              <span className="grid min-w-0 gap-px"><b className="text-[13px]">Claim $150 + a 50% deposit bonus</b><small className="text-[11.5px]" style={{ color: TC.muted }}>While you wait for approval, make sure you have claimed it</small></span>
            </a>
            <a href={WHATSAPP_CHANNEL} target="_blank" rel="noopener noreferrer" className={waitRow} style={{ borderColor: TC.line, background: TC.panel, color: TC.text }}>
              <span className="shrink-0"><WhatsAppMark size={18} /></span>
              <span className="grid min-w-0 gap-px"><b className="text-[13px]">WhatsApp channel</b><small className="text-[11.5px]" style={{ color: TC.muted }}>Join the community</small></span>
            </a>
            <a href={TELEGRAM_CHANNEL} target="_blank" rel="noopener noreferrer" className={waitRow} style={{ borderColor: TC.line, background: TC.panel, color: TC.text }}>
              <span className="shrink-0"><TelegramMark size={18} /></span>
              <span className="grid min-w-0 gap-px"><b className="text-[13px]">Telegram channel</b><small className="text-[11.5px]" style={{ color: TC.muted }}>Join the community</small></span>
            </a>
          </div>
          <button type="button" onClick={() => setWaitOpen(false)}
            className="mt-3 flex w-full items-center justify-center rounded-xl border px-3.5 py-2.5 text-[12.5px] font-semibold transition hover:bg-white/5"
            style={{ borderColor: TC.line, color: TC.text }}>Back to the request</button>
        </div>
      </div>
    )}
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
        <header className="flex items-start gap-3 border-b p-4" style={{ borderColor: TC.line }}>
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-bold" style={{ color: TC.text }}>Get the Clunoid EA</h2>
            <p className="mt-1 text-[12px] leading-snug" style={{ color: TC.muted }}>
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

        <div className="max-h-[70vh] overflow-y-auto px-4 py-4">
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
              {BROKER === "deriv" ? (
                <Step n={1} title="Open an MT5 account with Deriv" done={phase === "sent"}>
                  <p className="text-[12px] leading-snug" style={{ color: TC.muted }}>
                    Already have one under Clunoid? Skip to step 2.
                  </p>
                  <a href={DERIV_SIGNUP} target="_blank" rel="noopener noreferrer"
                    className="mt-1.5 inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[12.5px] font-semibold transition hover:bg-white/5"
                    style={{ borderColor: TC.line, color: TC.text }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/logos/metatrader5.svg" alt="MetaTrader 5" className="h-4 w-auto" style={{ maxWidth: 108 }} />
                    <span>Create account</span>
                    <ExternalLink size={13} style={{ color: TC.faint }} />
                  </a>
                </Step>
              ) : (
                <Step n={1} title="Open an MT5 account with Headway" done={phase === "sent"}>
                  {/* The way in: Headway's name on the button, and the same link
                      as a code to scan — a phone can open the account while the
                      desk keeps the terminal. */}
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] leading-snug" style={{ color: TC.muted }}>
                        Already have one under Clunoid? Skip to step 2. New to Headway? Open it through our link.
                      </p>
                      {/* The bonus, said once and loudly: amber on its own line. */}
                      <span className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-extrabold"
                        style={{ borderColor: "rgba(56,189,248,0.55)", background: "rgba(56,189,248,0.10)", color: TC.profit }}>
                        <Gift size={14} />Claim $150 + a 50% deposit bonus
                      </span>
                      <a href={HEADWAY_SIGNUP} target="_blank" rel="noopener noreferrer sponsored"
                        className="mt-1.5 inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[12.5px] font-semibold transition hover:bg-white/5"
                        style={{ borderColor: TC.line, color: TC.text }}>
                        <span className="text-[13.5px] font-extrabold tracking-tight" style={{ color: "#ff5468" }}>headway</span>
                        <span>Create account</span>
                        <ExternalLink size={13} style={{ color: TC.faint }} />
                      </a>
                      <p className="mt-1.5 text-[11.5px] leading-snug" style={{ color: TC.faint }}>
                        Opening it through this link places the account under our partner group — that is what we check. Then come back here with your new MT5 ID.
                      </p>
                    </div>
                    <a href={HEADWAY_SIGNUP} target="_blank" rel="noopener noreferrer sponsored" aria-label="Scan to open a Headway account"
                      className="flex shrink-0 flex-row items-center justify-center gap-2.5 text-[10.5px] font-semibold no-underline sm:flex-col sm:gap-1"
                      style={{ color: TC.faint }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/logos/headway-signup-qr.svg" alt="QR code — open a Headway MT5 account through the Clunoid link" width={84} height={84}
                        className="block rounded-lg border bg-white p-1" style={{ borderColor: TC.line }} />
                      <span>or scan</span>
                    </a>
                  </div>
                </Step>
              )}

              <Step n={2} title={BROKER === "deriv" ? "Client ID or MT5 ID" : "MT5 ID"} done={phase === "sent"}>
                <input
                  value={clientId} onChange={(e) => setClientId(e.target.value)}
                  placeholder={BROKER === "deriv" ? DERIV_EXAMPLE_ID : EXAMPLE_CLIENT_ID}
                  inputMode={BROKER === "deriv" ? undefined : "numeric"}
                  className="w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none"
                  style={{ borderColor: TC.line, background: TC.bg, color: TC.text }}
                />
                {BROKER === "deriv" ? (
                  <p className="mt-1.5 text-[11.5px] leading-snug" style={{ color: TC.faint }}>
                    Either works — a client ID looks like the example above, an MT5 ID is a short run
                    of digits.{" "}
                    <a href={DERIV_PROFILE} target="_blank" rel="noopener noreferrer"
                      className="font-semibold underline underline-offset-2" style={{ color: TC.profit }}>
                      Copy it from your Deriv profile
                    </a>
                    <ExternalLink size={10} className="ml-1 inline align-[-1px]" style={{ color: TC.profit }} />
                  </p>
                ) : (
                  <p className="mt-1.5 text-[11.5px] leading-snug" style={{ color: TC.faint }}>
                    The account number MetaTrader 5 shows at the top of the terminal, before the server name. It is also in your Headway personal area.
                  </p>
                )}
              </Step>

              <Step n={3} title={BROKER === "deriv" ? "Name and email" : "Name and email — as registered at Headway"} done={phase === "sent"}>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input value={name} onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    className="w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none"
                    style={{ borderColor: TC.line, background: TC.bg, color: TC.text }} />
                  <input value={email} onChange={(e) => setEmail(e.target.value)}
                    type="email" placeholder="you@email.com"
                    className="w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none"
                    style={{ borderColor: TC.line, background: TC.bg, color: TC.text }} />
                </div>
                {BROKER === "deriv" ? (
                  <p className="mt-1.5 text-[11.5px]" style={{ color: TC.faint }}>
                    So we can reach you about this account. Nothing else.
                  </p>
                ) : (
                  <p className="mt-1.5 text-[11.5px] leading-snug" style={{ color: TC.faint }}>
                    Use the exact name and email on your Headway account — that is how we match you. <b style={{ color: TC.text }}>The EA works only on the account we approve.</b>
                  </p>
                )}

                {left === 0 && (
                  <p className="mt-2.5 rounded-xl border p-2.5 text-[12px] leading-snug"
                    style={{ borderColor: "rgba(245,165,36,0.5)", background: "rgba(245,165,36,0.08)", color: "#f5a524" }}>
                    You have sent this three times. Wait for our reply in the support window — it unlocks sending again.
                  </p>
                )}
                <button type="button" onClick={send} disabled={!formOk || busy || left === 0}
                  className="mt-2.5 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition disabled:opacity-45"
                  style={{ background: TC.profit, color: TC.ink }}>
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
                  {phase === "sent" ? "Send again" : "Send for checking"}
                </button>
              </Step>

              {phase === "sent" && (
                <div className="mb-3 rounded-xl border p-3 text-[12px] leading-snug"
                  style={{ borderColor: "rgba(34,197,94,0.35)", background: "rgba(34,197,94,0.08)", color: TC.text }}>
                  <span>
                    <b>Sent.</b> We are checking your ID against our community list now.
                    Your code arrives in the <b>support window</b> — it has opened at the corner of
                    this page, and the reply lands there.
                  </span>
                  <button type="button" onClick={() => setWaitOpen(true)}
                    className="mt-2 block text-[12px] font-bold hover:underline" style={{ color: TC.profit }}>
                    While you wait: the bonus and the community →
                  </button>
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
                  {tm(err)}
                </div>
              )}

              {BROKER === "deriv" ? (
                <p className="mt-3 border-t pt-3 text-[11px] leading-snug" style={{ borderColor: TC.line, color: TC.faint }}>
                  We check every ID against our Deriv partner list. If yours is not under us,
                  we will say so and ask you to contact Deriv support to be added under{" "}
                  <code className="rounded px-1 py-0.5" style={{ background: TC.bg, color: TC.muted }}>{DERIV_PARTNER_ID}</code>{" "}
                  — then reply in the support window and we will check again.
                </p>
              ) : (
                <p className="mt-3 border-t pt-3 text-[11px] leading-snug" style={{ borderColor: TC.line, color: TC.faint }}>
                  We check every MT5 ID against our Headway partner list. If yours is not under us,
                  we will say so and tell you how to ask Headway to attach it to our Partner ID{" "}
                  <code className="rounded px-1 py-0.5" style={{ background: TC.bg, color: TC.muted }}>{PARTNER_ID}</code>{" "}
                  — then reply in the support window and we will check again.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
    </>
  );
}

function Step({ n, title, done, children }: {
  n: number; title: string; done: boolean; children: React.ReactNode;
}) {
  return (
    <section className="mb-3">
      <div className="mb-1.5 flex items-center gap-2.5">
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
