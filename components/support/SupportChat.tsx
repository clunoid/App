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
import { MessageCircle, X, Send, Loader2, Check, Mail, CircleAlert, ImagePlus, Paperclip, UserRound } from "lucide-react";
import { TC, monoFont } from "@/lib/trading/theme";
import {
  loadIdentity, saveIdentity, isEmail, isJustAGreeting, type SupportSource,
} from "@/lib/support/identity";

const A = "#a78bfa";
const GOOD = "#34d399";
const BAD = "#f2607d";

/** Kept so the thread survives a reload — this device, this browser. */
const NUDGED_KEY = "cln_support_nudged";
const THREAD_KEY = "cln_support_thread";

/* Which replies this person has actually READ.
 *
 * The unread count used to be React state and nothing else, so it lived
 * exactly as long as the page did. A reply collected on one page put a "1" on
 * the launcher; navigating anywhere cleared it, and it could never come back,
 * because collecting a reply marks it seen on the server and the next poll
 * rightly says there is nothing new. The count now comes from comparing the
 * stored thread against the ids of what has been read, both of which survive a
 * reload — so the badge stays until the panel is actually opened. */
const READ_KEY = "cln_support_read";

/** Local time, short. The date is added only when it is not today, because
 *  "14:32" is what you want for a reply that just arrived and useless on its
 *  own for one from Tuesday. */
function clockOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return time;
  const yesterday = new Date(today.getTime() - 86400000);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
  return `${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })} ${time}`;
}

/**
 * The arrival sound.
 *
 * Built rather than fetched: two soft notes a fifth apart, which is the shape
 * every messaging app uses because it reads as "something for you" and not as
 * an alarm. No asset to host, nothing to load before it can play.
 *
 * Browsers refuse audio until the person has interacted with the page, and
 * this is inside a widget they had to click and type into, so by the time a
 * reply arrives the gesture has happened. Where it has not, the call throws
 * and is swallowed — a missing chime is not worth a broken bubble.
 */
function chime() {
  try {
    type WithAudio = Window & { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const w = window as WithAudio;
    const Ctx = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();

    const note = (freq: number, at: number, len: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      // Eased in and out: a square-edged envelope clicks, and the click is the
      // part that sounds cheap.
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + len);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + len + 0.02);
    };

    note(784, 0, 0.16);    // G5
    note(1175, 0.13, 0.22); // D6
    setTimeout(() => { void ctx.close(); }, 900);
  } catch { /* no audio permission, or no audio at all */ }
}

const MAX_BYTES = 8 * 1024 * 1024;
const OK_IMAGES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
/* Documents too, not only screenshots: a set file, a log, a statement — the
   things people are asked for and then have nowhere to put. Kept to formats
   that are inert when opened; an .exe or a .zip full of one is not something to
   invite into a support inbox. */
const OK_DOCS = ["application/pdf", "text/plain", "text/csv", "application/json"];
const OK_TYPES = [...OK_IMAGES, ...OK_DOCS];

type Attached = { url: string; name: string; type: string } | null;

type Line = {
  id: string; text: string; at: string;
  shot?: string | null;
  /** A file the owner sent back — rendered inline when it is an image, and as
   *  something to open when it is not. */
  file?: Attached;
  from: "them" | "us";
  /** False for something we held back — a bare "hi" was never delivered, and
   *  telling them it was is the one thing this widget must not do. */
  sent?: boolean;
  /** True when this is the widget talking rather than a person answering. A
   *  real reply must never be styled like the greeting above it. */
  system?: boolean;
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
  /* Ids of replies already read, persisted. `unread` is derived from these
     rather than counted as events, so it cannot drift: whatever is in the
     thread and not in here is unread, on this page load or any later one. */
  const [read, setRead] = useState<string[]>([]);
  const [editWho, setEditWho] = useState(false);

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
      if (localStorage.getItem(NUDGED_KEY) === "1") setNudged(true);
      const seen = JSON.parse(localStorage.getItem(READ_KEY) || "[]");
      if (Array.isArray(seen)) setRead(seen.filter((x) => typeof x === "string"));
    } catch { /* nothing saved */ }
  }, []);

  // A registered creator's real record beats anything cached here.
  useEffect(() => {
    if (known && isEmail(known)) { setEmail(known); saveIdentity({ email: known }); }
    if (knownName) { setName(knownName); saveIdentity({ name: knownName }); }
  }, [known, knownName]);

  // Still nothing? Ask the server whether they are signed in to Clunoid.
  useEffect(() => {
    if (known || !open || email || editWho) return;
    let alive = true;
    fetch("/api/support")
      .then((r) => r.json())
      .then((d) => { if (alive && d?.email && isEmail(d.email)) { setEmail(d.email); saveIdentity({ email: d.email }); } })
      .catch(() => { /* they will type it */ });
    return () => { alive = false; };
  }, [open, known, email, editWho]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => boxRef.current?.focus(), 120);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => { clearTimeout(t); window.removeEventListener("keydown", onKey); };
  }, [open]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [thread, open]);

  /* Merge server-side replies over what is stored, matching on id.
   *
   * Not an append: the same reply may already be in the thread from an earlier
   * poll — possibly saved by an older version of this widget that knew nothing
   * about attachments and kept only the text. Patching by id repairs those
   * lines instead of showing them twice. */
  const mergeReplies = useCallback((reps: { id: string; body: string; createdAt: string; attachment?: Attached }[]) => {
    if (!reps.length) return;
    setThread((t) => {
      const next = [...t];
      for (const rep of reps) {
        const line: Line = {
          id: rep.id, text: rep.body, at: rep.createdAt, from: "us",
          file: rep.attachment ?? null,
        };
        const at = next.findIndex((l) => l.id === rep.id);
        if (at >= 0) next[at] = { ...next[at], ...line };
        else next.push(line);
      }
      next.sort((a, b) => a.at.localeCompare(b.at));
      const trimmed = next.slice(-30);
      try { localStorage.setItem(THREAD_KEY, JSON.stringify(trimmed)); } catch { /* private mode */ }
      return trimmed;
    });
  }, []);

  /* Opening the bubble re-asks for the recent replies.
   *
   * Cheap, marks nothing, and it is the only way a browser recovers from
   * having stored a reply in an older shape — the row was already marked seen,
   * so the ordinary poll will never offer it again. It also fills the thread
   * back in on a device that cleared its storage. */
  useEffect(() => {
    if (!open || !visitorId) return;
    let alive = true;
    fetch(`/api/support/replies?visitorId=${encodeURIComponent(visitorId)}&recent=1`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { replies?: { id: string; body: string; createdAt: string; attachment?: Attached }[] } | null) => {
        if (alive && d?.replies?.length) mergeReplies(d.replies);
      })
      .catch(() => { /* offline — the poll will catch up */ });
    return () => { alive = false; };
  }, [open, visitorId, mergeReplies]);

  const remember = useCallback((line: Line) => {
    setThread((t) => {
      const next = [...t, line].slice(-30);
      try { localStorage.setItem(THREAD_KEY, JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  }, []);

  /* Anything on the page can ask for the bubble, and hand it what was just
     sent on the page's behalf.
    
     The EA request uses this. It posts the request itself — it has to, because
     it also records the row a code is issued against — but the person then
     needs to SEE it here, in the thread the answer will arrive in. Without
     that they open the bubble onto an empty conversation and cannot tell
     whether anything happened. So the name and email it collected fill the
     fields, and the message it sent is added to the thread as sent. */
  useEffect(() => {
    const onAsk = (e: Event) => {
      const d = (e as CustomEvent).detail as
        | { name?: string; email?: string; text?: string }
        | undefined;
      if (d?.name) { setName(d.name); saveIdentity({ name: d.name }); }
      if (d?.email && isEmail(d.email)) { setEmail(d.email); saveIdentity({ email: d.email }); }
      if (d?.text) {
        remember({
          id: crypto.randomUUID?.() ?? String(Math.random()),
          text: d.text, at: new Date().toISOString(), from: "them", sent: true,
        });
      }
      setOpen(true);
    };
    window.addEventListener("clunoid:support-open", onAsk);
    return () => window.removeEventListener("clunoid:support-open", onAsk);
  }, [remember]);

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
        const d = (await r.json()) as { replies?: { id: string; body: string; createdAt: string; attachment?: Attached }[] };
        const fresh = d.replies ?? [];
        if (!alive || fresh.length === 0) return;

        mergeReplies(fresh);
        /* No counting here. The badge is derived from the thread, so a reply
           that arrives while the panel is shut simply is not in `read` yet. */
      } catch { /* offline, or the tab is asleep — try again next tick */ }
    };

    void tick();
    /* 45s when shut was too slow to feel like support: a reply could sit for
       most of a minute before the badge appeared, and the sound with it. 20s
       shut, and the request is one cheap read. */
    const every = open ? 7000 : 20000;
    const timer = setInterval(() => void tick(), every);
    return () => { alive = false; clearInterval(timer); };
  }, [visitorId, thread.length, open, mergeReplies]);

  /* Everything from us that has not been read yet. Derived, not counted. */
  const unreadLines = thread.filter((l) => l.from === "us" && !read.includes(l.id));
  const unread = unreadLines.length;

  // Opening the panel is reading them — every one currently in the thread.
  useEffect(() => {
    if (!open) return;
    const ids = thread.filter((l) => l.from === "us").map((l) => l.id);
    if (!ids.length) return;
    setRead((prev) => {
      const merged = [...new Set([...prev, ...ids])].slice(-80);
      if (merged.length === prev.length && ids.every((i) => prev.includes(i))) return prev;
      try { localStorage.setItem(READ_KEY, JSON.stringify(merged)); } catch { /* private mode */ }
      return merged;
    });
  }, [open, thread]);

  /* Sound the arrival, once per reply.
   *
   * Keyed on the newest unread id rather than on the count: a count can go up
   * for reasons that are not an arrival — a merge repairing an old line, a
   * second tab writing to storage — and each of those would have rung the bell
   * again for something the person had already been told about. */
  const rungFor = useRef<string | null>(null);
  useEffect(() => {
    if (open || !unread) return;
    const newest = unreadLines[unreadLines.length - 1]?.id;
    if (!newest || rungFor.current === newest) return;
    rungFor.current = newest;
    chime();
  }, [unread, open, unreadLines]);

  function pick(f: File | null) {
    setErr(null);
    if (!f) { setFile(null); return; }
    if (!OK_TYPES.includes(f.type)) { setErr("Send a screenshot (PNG, JPG, WEBP, GIF) or a document (PDF, TXT, CSV, JSON)."); return; }
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
      try { localStorage.setItem(NUDGED_KEY, "1"); } catch { /* private mode */ }
      remember({ id: crypto.randomUUID?.() ?? String(Math.random()), text: message, at: new Date().toISOString(), from: "them", sent: false });
      remember({
        id: crypto.randomUUID?.() ?? String(Math.random()),
        at: new Date().toISOString(),
        from: "us",
        system: true,
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
      setEditWho(false);
      if (fileRef.current) fileRef.current.value = "";
    } catch {
      setErr("We could not reach you just now. Try again in a minute.");
    } finally { setBusy(false); }
  }, [busy, text, file, email, name, source, visitorId, country, nudged, remember]);

  const needsWho = editWho || !isEmail(email) || !name.trim();

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
            {/* A ring that fades outward once a second. The badge alone is easy
                to miss on a page somebody is reading; motion is what a phone in
                a pocket cannot deliver and a screen can. */}
            <span aria-hidden className="absolute inset-0 animate-ping rounded-full"
              style={{ background: GOOD, opacity: 0.55 }} />
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
            <Bubble from="us" system>
              Hi{name ? ` ${name.split(" ")[0]}` : ""} — ask us anything. Tell us what happened and what you
              expected, and add a screenshot if you have one. The answer comes back here.
            </Bubble>

            {thread.map((l) => (
              l.from === "us" ? (
                <Bubble key={l.id} from="us" system={l.system} file={l.file ?? null}
                  at={l.at} fresh={!l.system && !read.includes(l.id)}>{l.text}</Bubble>
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
                      <Check size={11} /> Sent
                      <span style={{ color: TC.faint }}>· {clockOf(l.at)}</span>
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
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 text-[11px] leading-snug" style={{ color: TC.muted }}>
                    {editWho ? "Change these, then tap Done." : "Fill these in first so we can reply — then type what you need below."}
                  </p>
                  {/* Only offered once both are usable: a Done that saves an
                      unusable address would lose the reply. */}
                  {editWho && isEmail(email) && name.trim() ? (
                    <button
                      type="button"
                      onClick={() => { saveIdentity({ name, email }); setEditWho(false); }}
                      className="shrink-0 rounded-lg px-2.5 py-1 text-[11.5px] font-bold transition hover:brightness-110"
                      style={{ background: A, color: "#12091f" }}
                    >
                      Done
                    </button>
                  ) : null}
                </div>
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
              <button type="button" onClick={() => setEditWho(true)}
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

/**
 * A line from our side.
 *
 * `system` is the widget talking — the greeting, the nudge to say more. It stays
 * quiet and grey because it is furniture.
 *
 * Everything else is a real answer from a real person, and it is the reason the
 * window exists. It gets full-strength text, a lighter ground to sit on, an
 * accent edge, and a label saying who it is from — so it can never be mistaken
 * for the greeting it sits underneath.
 */
/**
 * A reply with its links clickable.
 *
 * Replies are plain text — they are typed into Telegram — so a URL in one
 * arrived as something to select and copy by hand, on a phone, out of a chat
 * bubble. The decline message sends people to their Deriv profile, and asking
 * somebody to hand-copy a link before they can do the thing you just asked
 * them to do is where they stop.
 *
 * Only http(s) is linked, and only what the owner typed: nothing here comes
 * from the visitor.
 */
const URLS = /(https?:\/\/[^\s<>()]+[^\s<>().,;:!?])/g;

function linkify(text: string): React.ReactNode {
  const parts = text.split(URLS);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer"
        className="font-semibold underline underline-offset-2 break-all"
        style={{ color: A }}>
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function Attachment({ file, bare }: { file: NonNullable<Attached>; bare?: boolean }) {
  /* An image is shown, because a screenshot you have to click is a screenshot
     you do not look at. Anything else is a link with its real name on it — the
     name is what tells you whether it is the file you were promised. */
  if (file.type.startsWith("image/")) {
    return (
      <a href={file.url} target="_blank" rel="noopener noreferrer" className={bare ? "block" : "mt-2 block"}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={file.url} alt={file.name}
          className="max-h-[280px] w-auto max-w-full rounded-xl border"
          style={{ borderColor: TC.line }} />
      </a>
    );
  }
  return (
    <a href={file.url} target="_blank" rel="noopener noreferrer"
      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[12px] font-semibold transition hover:bg-white/5 ${bare ? "" : "mt-2"}`}
      style={{ borderColor: TC.line, color: TC.text }}>
      <Paperclip size={13} style={{ color: A }} />
      <span className="max-w-[200px] truncate">{file.name}</span>
    </a>
  );
}

function Bubble({ children, system, file, at, fresh }: { from: "us"; children: React.ReactNode; system?: boolean; file?: Attached; at?: string; fresh?: boolean }) {
  /* A picture on its own is a whole answer, and a reply that is only a picture
     used to render as a bubble around an empty string — the "tiny empty card"
     with nothing in it. There is no text to lay out in that case, so there is
     no text element and no padding held open for one. */
  const hasText = typeof children === "string" ? children.trim().length > 0 : !!children;
  const body = hasText && typeof children === "string" ? linkify(children) : hasText ? children : null;
  const pad = hasText ? "px-3.5 py-3" : "p-1.5";

  if (system) {
    return (
      <div className={`max-w-[88%] rounded-2xl rounded-tl-md border text-[12.5px] leading-relaxed ${hasText ? "px-3.5 py-2.5" : "p-1.5"}`}
        style={{ borderColor: TC.line, background: "rgba(0,0,0,0.3)", color: TC.muted }}>
        {body}
        {file && <Attachment file={file} bare={!hasText} />}
      </div>
    );
  }

  return (
    <div className="max-w-[88%]">
      <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em]" style={{ color: A }}>
        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: GOOD }} />
        Clunoid support
        {/* Marked on the reply itself, not only on the launcher: somebody who
            opens the bubble onto a conversation they have read before needs to
            see WHICH message is the new one. */}
        {fresh && (
          <span className="rounded-full px-1.5 py-px text-[9px] font-bold tracking-normal"
            style={{ background: GOOD, color: "#04202e" }}>NEW</span>
        )}
        {at && (
          <span className="ml-auto font-medium normal-case tracking-normal" style={{ color: TC.faint }}>
            {clockOf(at)}
          </span>
        )}
      </div>
      <div
        className={`rounded-2xl rounded-tl-md border text-[13.5px] font-medium leading-[1.6] ${pad}`}
        style={{
          borderColor: `${A}55`,
          borderLeft: `3px solid ${A}`,
          background: "rgba(255,255,255,0.07)",
          color: TC.text,
          whiteSpace: "pre-wrap",
        }}
      >
        {body}
        {file && <Attachment file={file} bare={!hasText} />}
      </div>
    </div>
  );
}
