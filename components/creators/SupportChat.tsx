"use client";

/**
 * CREATOR PROGRAM — the support bubble.
 *
 * Somebody stuck on a rule at eleven at night will not open their email client
 * and compose a letter. They will type one line into a box if there is a box.
 * So: a box, in the corner, on every state of this page.
 *
 * Two things make it worth having. The email is filled in already, so the whole
 * interaction is type-and-send. And what they send stays on screen afterwards,
 * because a form that swallows your words and says "thanks" leaves you unsure
 * anything happened.
 *
 * The reply comes back by email. Where the message lands on our side is not
 * something the creator needs to think about, and nothing here mentions it.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Loader2, Check, Mail, CircleAlert } from "lucide-react";
import { TC, monoFont } from "@/lib/trading/theme";
import { A, GOOD, BAD } from "./content";

/** Kept so the thread survives a reload — this device only. */
const THREAD_KEY = "cln_support_thread";
const EMAIL_KEY = "cln_support_email";

type Line = { id: string; text: string; at: string };

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

export function SupportChat({ email: known, name, country }: {
  email?: string | null; name?: string | null; country?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [editingEmail, setEditingEmail] = useState(false);
  const [text, setText] = useState("");
  const [thread, setThread] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const boxRef = useRef<HTMLTextAreaElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  // Restore the thread, and the address they last used, before anything else.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(THREAD_KEY) || "[]");
      if (Array.isArray(saved)) setThread(saved.filter((l) => l && typeof l.text === "string"));
      const e = localStorage.getItem(EMAIL_KEY);
      if (e && isEmail(e)) setEmail(e);
    } catch { /* nothing saved */ }
  }, []);

  // A registered creator's own address wins over anything cached here.
  useEffect(() => { if (known && isEmail(known)) setEmail(known); }, [known]);

  // Nobody signed in and nothing cached? Ask the server who this is.
  useEffect(() => {
    if (known || !open || email) return;
    let alive = true;
    fetch("/api/support")
      .then((r) => r.json())
      .then((d) => { if (alive && d?.email && isEmail(d.email)) setEmail(d.email); })
      .catch(() => { /* they will type it */ });
    return () => { alive = false; };
  }, [open, known, email]);

  useEffect(() => {
    if (!open) return;
    // Straight into the box: the email is usually already filled in.
    const t = setTimeout(() => boxRef.current?.focus(), 120);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => { clearTimeout(t); window.removeEventListener("keydown", onKey); };
  }, [open]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [thread, open]);

  const send = useCallback(async () => {
    if (busy) return;
    const message = text.trim();
    if (message.length < 2) { setErr("Write your message first."); return; }
    if (!isEmail(email)) { setErr("Add the email we should reply to."); setEditingEmail(true); return; }

    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/support", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email, message, name, country,
          page: typeof window !== "undefined" ? window.location.pathname : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(data.error || "We could not send that just now."); return; }

      const line: Line = { id: Math.random().toString(36).slice(2), text: message, at: new Date().toISOString() };
      setThread((t) => {
        const next = [...t, line].slice(-25);
        try { localStorage.setItem(THREAD_KEY, JSON.stringify(next)); } catch { /* private mode */ }
        return next;
      });
      try { localStorage.setItem(EMAIL_KEY, email); } catch { /* private mode */ }
      setText("");
      setEditingEmail(false);
    } catch {
      setErr("We could not reach you just now. Try again in a minute.");
    } finally { setBusy(false); }
  }, [busy, text, email, name, country]);

  return (
    <>
      {/* ── the bubble ───────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close support" : "Message support"}
        aria-expanded={open}
        className="fixed bottom-4 right-4 z-[60] grid h-14 w-14 place-items-center rounded-full shadow-2xl transition hover:scale-105 active:scale-95 sm:bottom-6 sm:right-6"
        style={{ background: open ? TC.panel : A, color: open ? TC.text : "#12091f", border: `1px solid ${open ? TC.line : "transparent"}` }}
      >
        {open ? <X size={22} /> : <MessageCircle size={24} />}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Message support"
          className="fixed inset-x-3 bottom-[86px] z-[59] flex max-h-[calc(100dvh-120px)] flex-col overflow-hidden rounded-2xl border shadow-2xl sm:inset-x-auto sm:right-6 sm:w-[380px]"
          style={{ borderColor: TC.line, background: TC.panel, boxShadow: "0 24px 60px rgba(0,0,0,0.6)" }}
        >
          {/* header */}
          <div className="flex items-center gap-2.5 border-b px-4 py-3.5" style={{ borderColor: TC.line, background: `linear-gradient(180deg, ${A}16, transparent)` }}>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: `${A}22`, color: A }}>
              <MessageCircle size={17} />
            </span>
            <div className="min-w-0">
              <div className="text-[14px] font-bold leading-tight">Talk to us</div>
              <div className="flex items-center gap-1 text-[11px]" style={{ color: TC.faint }}>
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: GOOD }} />
                Usually answered within a day
              </div>
            </div>
          </div>

          {/* thread */}
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            <div className="max-w-[85%] rounded-2xl rounded-tl-md border px-3.5 py-2.5 text-[12.5px] leading-relaxed"
              style={{ borderColor: TC.line, background: "rgba(0,0,0,0.25)", color: TC.muted }}>
              Hi{name ? ` ${name.split(" ")[0]}` : ""} — ask us anything about the Creator Program: payouts,
              platforms, whether a video counts. Type it below and we will reply to your email.
            </div>

            {thread.map((l) => (
              <div key={l.id} className="ml-auto max-w-[85%]">
                <div className="rounded-2xl rounded-br-md px-3.5 py-2.5 text-[12.5px] leading-relaxed"
                  style={{ background: `${A}22`, border: `1px solid ${A}44`, color: TC.text }}>
                  {l.text}
                </div>
                <div className="mt-1 flex items-center justify-end gap-1 text-[10.5px]" style={{ color: GOOD }}>
                  <Check size={11} /> Sent · we will reply by email
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>

          {/* where the reply goes */}
          <div className="border-t px-4 py-2.5" style={{ borderColor: TC.line }}>
            {editingEmail || !isEmail(email) ? (
              <div className="flex items-center gap-2">
                <Mail size={13} className="shrink-0" style={{ color: A }} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setErr(null); }}
                  onBlur={() => { if (isEmail(email)) setEditingEmail(false); }}
                  placeholder="Your email for the reply"
                  aria-label="Your email for the reply"
                  className="min-w-0 flex-1 rounded-lg border bg-transparent px-2.5 py-1.5 text-[12.5px] outline-none transition focus:border-violet-400"
                  style={{ borderColor: TC.line, color: TC.text }}
                />
              </div>
            ) : (
              <button type="button" onClick={() => setEditingEmail(true)}
                className="flex w-full items-center gap-1.5 text-left text-[11.5px] transition hover:opacity-80" style={{ color: TC.faint }}>
                <Mail size={12} className="shrink-0" style={{ color: A }} />
                <span className="min-w-0 flex-1 truncate" style={monoFont}>{email}</span>
                <span className="shrink-0 font-semibold" style={{ color: A }}>Change</span>
              </button>
            )}
          </div>

          {err && (
            <div className="flex items-start gap-1.5 px-4 pb-1 text-[11.5px] font-medium" style={{ color: BAD }}>
              <CircleAlert size={12} className="mt-0.5 shrink-0" /> {err}
            </div>
          )}

          {/* the box */}
          <div className="flex items-end gap-2 border-t px-3 py-3" style={{ borderColor: TC.line }}>
            <textarea
              ref={boxRef}
              value={text}
              onChange={(e) => { setText(e.target.value); setErr(null); }}
              onKeyDown={(e) => {
                // Enter sends, shift-enter breaks the line — as everywhere else.
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
              }}
              rows={1}
              placeholder="Type your message…"
              aria-label="Your message"
              className="max-h-28 min-h-[40px] flex-1 resize-none rounded-xl border bg-transparent px-3 py-2.5 text-[13px] leading-snug outline-none transition focus:border-violet-400"
              style={{ borderColor: TC.line, color: TC.text }}
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={busy || text.trim().length < 2}
              aria-label="Send"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: A, color: "#12091f" }}
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
