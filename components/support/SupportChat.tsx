"use client";

/**
 * THE SUPPORT BUBBLE — on every page of Clunoid Trading.
 *
 * Somebody stuck at eleven at night will not open their email client and
 * compose a letter. They will type one line into a box if there is a box. So:
 * a box, in the corner, wherever they happen to be.
 *
 * Four things make it worth having rather than just present.
 *
 *   · It knows who they are. A registered creator's own record, or the
 *     signed-in session, or what they typed here once on another page. Most
 *     people only ever type the message.
 *   · It knows where they were. Home, the bots, Exness, TradingView, the
 *     Creator Program — so an answer can start from the thing they were
 *     looking at.
 *   · It takes screenshots, because "it looks wrong" and a picture of it
 *     looking wrong are not the same message.
 *   · It asks for detail when someone opens with "hi", instead of spending a
 *     round trip each way to find out what they wanted.
 *
 * The reply comes back by email. Where the message lands on our side is not
 * something the user needs to think about, and nothing here mentions it.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Loader2, Check, Mail, CircleAlert, ImagePlus, UserRound } from "lucide-react";
import { TC, monoFont } from "@/lib/trading/theme";
import {
  loadIdentity, saveIdentity, isEmail, isJustAGreeting, type SupportSource,
} from "@/lib/support/identity";

const A = "#a78bfa";
const GOOD = "#34d399";
const BAD = "#f2607d";

/** Kept so the thread survives a reload — this device, this browser. */
const THREAD_KEY = "cln_support_thread";

const MAX_BYTES = 8 * 1024 * 1024;
const OK_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

type Line = {
  id: string; text: string; at: string;
  shot?: string | null;
  from: "them" | "us";
  /** False for something we held back — a bare "hi" was never delivered, and
   *  telling them it was is the one thing this widget must not do. */
  sent?: boolean;
};

export function SupportChat({ source, email: known, name: knownName, country }: {
  source: SupportSource;
  email?: string | null;
  name?: string | null;
  country?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [visitorId, setVisitorId] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [thread, setThread] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [nudged, setNudged] = useState(false);
  const [unread, setUnread] = useState(0);

  const boxRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  // Whatever this browser already knows, shared by every page.
  useEffect(() => {
    const id = loadIdentity();
    setVisitorId(id.visitorId);
    if (id.name) setName(id.name);
    if (id.email) setEmail(id.email);
    try {
      const saved = JSON.parse(localStorage.getItem(THREAD_KEY) || "[]");
      if (Array.isArray(saved)) setThread(saved.filter((l) => l && typeof l.text === "string"));
    } catch { /* nothing saved */ }
  }, []);

  // A registered creator's real record beats anything cached here.
  useEffect(() => {
    if (known && isEmail(known)) { setEmail(known); saveIdentity({ email: known }); }
    if (knownName) { setName(knownName); saveIdentity({ name: knownName }); }
  }, [known, knownName]);

  // Still nothing? Ask the server whether they are signed in to Clunoid.
  useEffect(() => {
    if (known || !open || email) return;
    let alive = true;
    fetch("/api/support")
      .then((r) => r.json())
      .then((d) => { if (alive && d?.email && isEmail(d.email)) { setEmail(d.email); saveIdentity({ email: d.email }); } })
      .catch(() => { /* they will type it */ });
    return () => { alive = false; };
  }, [open, known, email]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => boxRef.current?.focus(), 120);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => { clearTimeout(t); window.removeEventListener("keydown", onKey); };
  }, [open]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [thread, open]);

  const remember = useCallback((line: Line) => {
    setThread((t) => {
      const next = [...t, line].slice(-30);
      try { localStorage.setItem(THREAD_KEY, JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  }, []);

  /**
   * Collect anything the owner has replied.
   *
   * Polled rather than pushed: a websocket for a support bubble that is open
   * for two minutes at a time is not worth the moving parts. Fast while the
   * panel is open, slow when it is shut — a closed bubble only needs to know
   * whether to show a dot.
   *
   * Only runs once they have actually asked something. Somebody who never
   * opened the bubble has nothing waiting, and polling for them would be a
   * request per visitor per minute for no reason.
   */
  useEffect(() => {
    if (!visitorId || thread.length === 0) return;
    let alive = true;

    const tick = async () => {
      try {
        const r = await fetch(`/api/support/replies?visitorId=${encodeURIComponent(visitorId)}`, { cache: "no-store" });
        if (!r.ok) return;
        const d = (await r.json()) as { replies?: { id: string; body: string; createdAt: string }[] };
        const fresh = d.replies ?? [];
        if (!alive || fresh.length === 0) return;

        for (const rep of fresh) {
          remember({ id: rep.id, text: rep.body, at: rep.createdAt, from: "us" });
        }
        if (!open) setUnread((n) => n + fresh.length);
      } catch { /* offline, or the tab is asleep — try again next tick */ }
    };

    void tick();
    const every = open ? 7000 : 45000;
    const timer = setInterval(() => void tick(), every);
    return () => { alive = false; clearInterval(timer); };
  }, [visitorId, thread.length, open, remember]);

  // Opening the panel is reading them.
  useEffect(() => { if (open) setUnread(0); }, [open]);

  function pick(f: File | null) {
    setErr(null);
    if (!f) { setFile(null); return; }
    if (!OK_TYPES.includes(f.type)) { setErr("Screenshots only — PNG, JPG, WEBP or GIF."); return; }
    if (f.size > MAX_BYTES) { setErr("That image is too large — keep it under 8MB."); return; }
    setFile(f);
  }

  const send = useCallback(async () => {
    if (busy) return;
    const message = text.trim();
    if (message.length < 2 && !file) { setErr("Write your message first."); return; }

    // "hi" is not a question yet. Ask once, then take them at their word.
    if (!file && !nudged && isJustAGreeting(message)) {
      setNudged(true);
      remember({ id: crypto.randomUUID?.() ?? String(Math.random()), text: message, at: new Date().toISOString(), from: "them", sent: false });
      remember({
        id: crypto.randomUUID?.() ?? String(Math.random()),
        at: new Date().toISOString(),
        from: "us",
        text: "Hello! So we can actually help, tell us what you need in a bit of detail — what you were doing, what happened, and what you expected instead. A screenshot helps too. Then send it and keep this window open — the answer usually comes back here in a few minutes.",
      });
      setText("");
      return;
    }

    if (!isEmail(email)) { setErr("Add the email we should reply to."); return; }
    if (!name.trim()) { setErr("Add your name so we know who we are replying to."); return; }

    setBusy(true); setErr(null);
    try {
      const form = new FormData();
      form.append("email", email);
      form.append("name", name.trim());
      form.append("message", message);
      form.append("source", source);
      form.append("visitorId", visitorId);
      if (country) form.append("country", country);
      if (typeof window !== "undefined") form.append("page", window.location.pathname);
      if (file) form.append("file", file);

      const res = await fetch("/api/support", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(data.error || "We could not send that just now."); return; }

      saveIdentity({ name, email });
      remember({
        id: crypto.randomUUID?.() ?? String(Math.random()),
        text: message || "(screenshot)",
        at: new Date().toISOString(),
        from: "them",
        sent: true,
        shot: file ? file.name : null,
      });
      setText("");
      setFile(null);
      setNudged(false);
      if (fileRef.current) fileRef.current.value = "";
    } catch {
      setErr("We could not reach you just now. Try again in a minute.");
    } finally { setBusy(false); }
  }, [busy, text, file, email, name, source, visitorId, country, nudged, remember]);

  const needsWho = !isEmail(email) || !name.trim();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close support" : "Message support"}
        aria-expanded={open}
        className="fixed bottom-4 right-4 z-[60] grid h-14 w-14 place-items-center rounded-full shadow-2xl transition hover:scale-105 active:scale-95 sm:bottom-6 sm:right-6"
        style={{
          background: open ? TC.panelSolid : A,
          color: open ? TC.text : "#12091f",
          border: `1px solid ${open ? TC.line : "transparent"}`,
        }}
      >
        {open ? <X size={22} /> : <MessageCircle size={24} />}
        {/* A reply arrived while this was shut. Count, not a bare dot — knowing
            there are three waiting is worth the extra glyph. */}
        {!open && unread > 0 && (
          <span
            aria-label={`${unread} new ${unread === 1 ? "reply" : "replies"}`}
            className="absolute -right-0.5 -top-0.5 grid h-5 min-w-[20px] place-items-center rounded-full px-1 text-[11px] font-bold"
            style={{ background: GOOD, color: "#04202e", border: "2px solid " + TC.bg }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Message support"
          className="fixed inset-x-3 bottom-[86px] z-[59] flex max-h-[calc(100dvh-120px)] flex-col overflow-hidden rounded-2xl border sm:inset-x-auto sm:right-6 sm:w-[380px]"
          style={{
            borderColor: TC.line,
            // Opaque, not a tint: the page behind it must not compete with what
            // they are reading and typing.
            background: TC.panelSolid,
            boxShadow: "0 24px 70px rgba(0,0,0,0.7)",
          }}
        >
          {/* header */}
          <div className="flex items-center gap-2.5 border-b px-4 py-3.5"
            style={{ borderColor: TC.line, background: `${A}18` }}>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: `${A}2e`, color: A }}>
              <MessageCircle size={17} />
            </span>
            <div className="min-w-0">
              <div className="text-[14px] font-bold leading-tight" style={{ color: TC.text }}>Talk to us</div>
              <div className="flex items-center gap-1 text-[11px]" style={{ color: TC.muted }}>
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: GOOD }} />
                Usually answered within a day
              </div>
            </div>
          </div>

          {/* thread */}
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            <Bubble from="us">
              Hi{name ? ` ${name.split(" ")[0]}` : ""} — ask us anything. Tell us what happened and what you
              expected, and add a screenshot if you have one. The answer comes back here.
            </Bubble>

            {thread.map((l) => (
              l.from === "us" ? (
                <Bubble key={l.id} from="us">{l.text}</Bubble>
              ) : (
                <div key={l.id} className="ml-auto max-w-[85%]">
                  <div className="rounded-2xl rounded-br-md px-3.5 py-2.5 text-[12.5px] leading-relaxed"
                    style={{ background: `${A}2a`, border: `1px solid ${A}55`, color: TC.text }}>
                    {l.text}
                    {l.shot && (
                      <span className="mt-1.5 flex items-center gap-1 text-[11px]" style={{ color: TC.muted }}>
                        <ImagePlus size={11} /> {l.shot}
                      </span>
                    )}
                  </div>
                  {l.sent !== false && (
                    <div className="mt-1 flex items-center justify-end gap-1 text-[10.5px]" style={{ color: GOOD }}>
                      <Check size={11} /> Sent · check back here or your email
                    </div>
                  )}
                </div>
              )
            ))}
            <div ref={endRef} />
          </div>

          {/* who we are replying to */}
          <div className="border-t px-4 py-2.5" style={{ borderColor: TC.line }}>
            {needsWho ? (
              <div className="space-y-2">
                <p className="text-[11px] leading-snug" style={{ color: TC.muted }}>
                  Fill these in first so we can reply — then type what you need below.
                </p>
                <div className="flex items-center gap-2">
                  <UserRound size={13} className="shrink-0" style={{ color: A }} />
                  <input
                    value={name}
                    onChange={(e) => { setName(e.target.value); setErr(null); }}
                    onBlur={() => saveIdentity({ name })}
                    placeholder="Your name"
                    aria-label="Your name"
                    className="min-w-0 flex-1 rounded-lg border px-2.5 py-1.5 text-[12.5px] outline-none transition focus:border-violet-400"
                    style={{ borderColor: TC.line, background: "rgba(0,0,0,0.35)", color: TC.text }}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Mail size={13} className="shrink-0" style={{ color: A }} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setErr(null); }}
                    onBlur={() => saveIdentity({ email })}
                    placeholder="Your email for the reply"
                    aria-label="Your email for the reply"
                    className="min-w-0 flex-1 rounded-lg border px-2.5 py-1.5 text-[12.5px] outline-none transition focus:border-violet-400"
                    style={{ borderColor: TC.line, background: "rgba(0,0,0,0.35)", color: TC.text }}
                  />
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => { setEmail(""); }}
                className="flex w-full items-center gap-1.5 text-left text-[11.5px] transition hover:opacity-80" style={{ color: TC.muted }}>
                <Mail size={12} className="shrink-0" style={{ color: A }} />
                <span className="min-w-0 flex-1 truncate" style={monoFont}>{email}</span>
                <span className="shrink-0 font-semibold" style={{ color: A }}>Change</span>
              </button>
            )}
          </div>

          {err && (
            <div className="flex items-start gap-1.5 px-4 pb-1 pt-1.5 text-[11.5px] font-medium" style={{ color: BAD }}>
              <CircleAlert size={12} className="mt-0.5 shrink-0" /> {err}
            </div>
          )}

          {file && (
            <div className="mx-3 mt-2 flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11.5px]"
              style={{ borderColor: `${GOOD}55`, background: `${GOOD}14`, color: TC.text }}>
              <ImagePlus size={13} className="shrink-0" style={{ color: GOOD }} />
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <button type="button" onClick={() => pick(null)} aria-label="Remove screenshot"
                className="shrink-0 rounded p-0.5 transition hover:bg-white/10" style={{ color: TC.muted }}>
                <X size={13} />
              </button>
            </div>
          )}

          {/* the box */}
          <div className="flex items-end gap-2 border-t px-3 py-3" style={{ borderColor: TC.line }}>
            <input
              ref={fileRef}
              type="file"
              accept={OK_TYPES.join(",")}
              className="hidden"
              onChange={(e) => pick(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              aria-label="Attach a screenshot"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border transition hover:bg-white/5"
              style={{ borderColor: TC.line, color: file ? GOOD : TC.muted }}
            >
              <ImagePlus size={16} />
            </button>
            <textarea
              ref={boxRef}
              value={text}
              onChange={(e) => { setText(e.target.value); setErr(null); }}
              onKeyDown={(e) => {
                // Enter sends, shift-enter breaks the line — as everywhere else.
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
              }}
              onPaste={(e) => {
                // Most screenshots arrive on the clipboard, not as a saved file.
                const img = Array.from(e.clipboardData?.files ?? []).find((f) => OK_TYPES.includes(f.type));
                if (img) { e.preventDefault(); pick(img); }
              }}
              rows={1}
              placeholder="Type what you need…"
              aria-label="Your message"
              className="max-h-28 min-h-[40px] flex-1 resize-none rounded-xl border px-3 py-2.5 text-[13px] leading-snug outline-none transition focus:border-violet-400"
              style={{ borderColor: TC.line, background: "rgba(0,0,0,0.35)", color: TC.text }}
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={busy || (text.trim().length < 2 && !file)}
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

function Bubble({ children }: { from: "us"; children: React.ReactNode }) {
  return (
    <div className="max-w-[88%] rounded-2xl rounded-tl-md border px-3.5 py-2.5 text-[12.5px] leading-relaxed"
      style={{ borderColor: TC.line, background: "rgba(0,0,0,0.3)", color: TC.muted }}>
      {children}
    </div>
  );
}
