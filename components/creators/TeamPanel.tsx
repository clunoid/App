"use client";

/**
 * CREATOR PROGRAM — your team.
 *
 * One creator posting alone is one creator. A creator who brings three friends
 * in is four, and every one of them is putting Clunoid in front of a different
 * audience. So: share your link, and when someone you brought gets paid, you
 * get $20.
 *
 * The link is also the answer to a real risk. A hundred bios all carrying the
 * identical clunoid.com URL is the exact shape of coordinated spam, and it is
 * how a domain ends up flagged or blocked on a platform. Every creator having
 * their own address avoids that — and it lands on the product, not on this
 * programme, because someone arriving from a video should meet the bots first.
 *
 * On the wordings: there is no "selected" one. Whatever sits at the top of the
 * list is what goes out — a starred version if they starred one, otherwise this
 * visit's random pick. Nothing is ever shown as chosen that the creator did not
 * choose, and fifty people do not all send the same sentence.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Users, Copy, Check, Link2, Share2, ShieldCheck, Clock, X, Loader2, UserPlus,
  MessageSquare, Star, ChevronDown,
} from "lucide-react";
import { TC, monoFont } from "@/lib/trading/theme";
import { A, GOOD, BAD, fmt, INVITE_VARIANTS } from "./content";
import type { Me } from "./CreatorDashboard";

const card = "rounded-2xl border p-4 sm:p-5";
const cardStyle = { borderColor: TC.line, background: TC.panel } as const;
const labelCls = "text-[10.5px] font-semibold uppercase tracking-wider";
const money = (n: number) => "$" + n.toFixed(0);

/** Which wordings this creator starred. Their device, their preference. */
const FAVES_KEY = "cln_invite_faves";

type Variant = (typeof INVITE_VARIANTS)[number];

export function TeamPanel({ me, show, onRefresh, token }: {
  me: Me; show: (t: string, tone?: "ok" | "bad") => void; onRefresh: () => Promise<void>; token: string;
}) {
  const { creator, team, teamTotals } = me;
  const [copied, setCopied] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [favourites, setFavourites] = useState<string[]>([]);
  const [origin, setOrigin] = useState("https://clunoid.com");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Shuffled once per visit, so with nothing starred the top one differs
  // between creators and between sessions.
  const [shuffle] = useState(() => INVITE_VARIANTS.map((v) => v.key).sort(() => Math.random() - 0.5));

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
    try {
      const saved = JSON.parse(localStorage.getItem(FAVES_KEY) || "[]");
      if (Array.isArray(saved)) setFavourites(saved.filter((k) => typeof k === "string"));
    } catch { /* nothing saved */ }
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, []);

  const rank = (k: string) => (favourites.includes(k) ? -1000 + favourites.indexOf(k) : shuffle.indexOf(k));
  const ordered: Variant[] = [...INVITE_VARIANTS].sort((x, y) => rank(x.key) - rank(y.key));

  function toggleFave(key: string) {
    setFavourites((cur) => {
      const next = cur.includes(key) ? cur.filter((k) => k !== key) : [key, ...cur];
      try { localStorage.setItem(FAVES_KEY, JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  }

  const code = creator.referral_code ?? "";
  const link = code ? `${origin}/r/${code}` : "";
  const message = (ordered[0] ?? INVITE_VARIANTS[0]).body(link);

  const copy = useCallback(async (what: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      show(what === "link" ? "Link copied — put it in your bio"
        : what === "message" ? "Message copied — paste and send"
        : "Code copied");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(null), 1600);
    } catch {
      show("Could not copy — select it and copy by hand.", "bad");
    }
  }, [show]);

  /** Share sends the whole pitch, not a bare URL nobody will click. */
  async function share() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "Get paid to post", text: message });
        return;
      } catch { /* they closed the sheet */ }
    }
    copy("message", message);
  }

  return (
    <div className="space-y-4">
      {/* ── what this is ──────────────────────────────────────────────────── */}
      <section className={card} style={{ borderColor: `${A}55`, background: `linear-gradient(180deg, ${A}12, rgba(255,255,255,0.015))` }}>
        <h2 className="flex items-center gap-2 text-[18px] font-bold sm:text-[20px]">
          <Users size={18} style={{ color: A }} /> Build a team, earn together
        </h2>
        <p className="mt-2 max-w-3xl text-[13px] leading-relaxed" style={{ color: TC.muted }}>
          Share your link with friends, other creators, anyone. Whoever joins through it becomes part of your team —
          and the moment one of them gets paid, <b style={{ color: GOOD }}>you get {money(teamTotals.perPersonUsd)}</b>{" "}
          for that person. There is no limit on how many people you bring, and it does not touch what they earn.
        </p>
      </section>

      {/* ── the link ──────────────────────────────────────────────────────── */}
      <section className={card} style={cardStyle}>
        <h2 className={`flex items-center gap-2 ${labelCls}`} style={{ color: TC.faint }}>
          <Link2 size={14} style={{ color: A }} /> Your link
        </h2>

        <div className="mt-3 flex flex-wrap items-stretch gap-2">
          <div className="flex min-w-0 flex-1 items-center rounded-xl border px-3 py-2.5"
            style={{ borderColor: `${A}55`, background: "rgba(0,0,0,0.28)" }}>
            <span className="min-w-0 flex-1 truncate text-[13.5px]" style={{ ...monoFont, color: TC.text }}>
              {link || "…"}
            </span>
          </div>
          <button type="button" onClick={() => setPicking(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-[12.5px] font-semibold transition hover:opacity-90"
            style={{ background: copied ? GOOD : A, color: copied ? "#06231a" : "#12091f" }}>
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
          </button>
          <button type="button" onClick={share}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3.5 py-2.5 text-[12.5px] font-semibold transition hover:bg-white/5"
            style={{ borderColor: TC.line, color: TC.text }}>
            <Share2 size={14} /> Share
          </button>
          <button type="button" onClick={() => setBrowsing(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3.5 py-2.5 text-[12.5px] font-semibold transition hover:bg-white/5"
            style={{ borderColor: TC.line, color: TC.muted }}>
            <MessageSquare size={14} style={{ color: A }} /> Send a message
          </button>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <span className="text-[11.5px]" style={{ color: TC.faint }}>Or just give someone the code:</span>
          <button type="button" onClick={() => copy("code", code)}
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[13px] font-bold tracking-[0.12em] transition hover:opacity-85"
            style={{ ...monoFont, borderColor: `${A}66`, background: `${A}14`, color: A }}>
            {code || "…"} {copied === "code" ? <Check size={12} /> : <Copy size={12} />}
          </button>
        </div>

        <div className="mt-4 rounded-xl border p-3" style={{ borderColor: `${GOOD}44`, background: `${GOOD}10` }}>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: GOOD }}>
            <ShieldCheck size={13} /> Use this link in your bios, not clunoid.com
          </div>
          <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
            Put <b style={{ color: TC.text }}>your own link</b> in the bio of all three profiles. It opens
            clunoid.com exactly the same, so &ldquo;link in bio&rdquo; is still true.
          </p>
        </div>
      </section>

      {/* ── linking up by code, for anyone who missed the link ────────────── */}
      <JoinByCode token={token} me={me} show={show} onRefresh={onRefresh} />

      {/* ── the numbers ───────────────────────────────────────────────────── */}
      <section className="grid gap-3 sm:grid-cols-3">
        <Stat label="People you brought" value={String(teamTotals.members)} sub="Joined through your link" tone={A} />
        <Stat label="Earned from your team" value={money(teamTotals.earnedUsd)}
          sub={teamTotals.earning === 1 ? "1 of them has been paid" : `${teamTotals.earning} of them have been paid`} tone={GOOD} />
        <Stat label="Waiting on them" value={money(teamTotals.pendingUsd)} sub="Yours once they get paid" tone={A} />
      </section>

      {/* ── who is in it ──────────────────────────────────────────────────── */}
      <section className={card} style={cardStyle}>
        <h2 className={`flex items-center gap-2 ${labelCls}`} style={{ color: TC.faint }}>
          <Users size={14} style={{ color: A }} /> Your team ({team.length})
        </h2>

        {team.length === 0 ? (
          <p className="mt-3 text-[12.5px] leading-relaxed" style={{ color: TC.faint }}>
            Nobody yet. Send your link to one person who would enjoy this — that is how every team starts.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <thead>
                <tr>
                  {["Name", "Code", "Country", "Joined", "Status", "You earn"].map((h) => (
                    <th key={h} className={`pb-2 ${labelCls}`} style={{ color: TC.faint }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {team.map((m, i) => (
                  <tr key={`${m.name}-${m.joined}-${i}`} className="border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                    <td className="py-2 text-[13px] font-medium">{m.name}</td>
                    <td className="py-2 text-[12px] tracking-[0.1em]" style={{ ...monoFont, color: A }}>{m.code ?? "—"}</td>
                    <td className="py-2 text-[12px]" style={{ color: TC.muted }}>{m.country || "—"}</td>
                    <td className="py-2 text-[12px]" style={{ color: TC.muted }}>{fmt(m.joined)}</td>
                    <td className="py-2">
                      <span className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold"
                        style={m.paid
                          ? { background: `${GOOD}22`, color: GOOD }
                          : m.started
                            ? { background: `${A}1f`, color: A }
                            : { background: "rgba(255,255,255,0.07)", color: TC.muted }}>
                        {m.paid ? <Check size={11} /> : <Clock size={11} />}
                        {m.paid ? "Paid" : m.started ? "Posting" : "Not started"}
                      </span>
                    </td>
                    <td className="py-2 text-[13px] font-bold" style={{ ...monoFont, color: m.paid ? GOOD : TC.faint }}>
                      {m.paid ? money(teamTotals.perPersonUsd) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-3 text-[11.5px] leading-relaxed" style={{ color: TC.faint }}>
          Team money is paid on request, alongside your normal payout. Ask for it any time there is something in
          &ldquo;Earned from your team&rdquo;.
        </p>
      </section>

      {picking && (
        <CopyChoice
          link={link}
          variants={ordered}
          favourites={favourites}
          onFave={toggleFave}
          onClose={() => setPicking(false)}
          onPick={(what, value) => { setPicking(false); copy(what, value); }}
        />
      )}

      {browsing && (
        <MessageLibrary
          link={link}
          variants={ordered}
          favourites={favourites}
          onFave={toggleFave}
          onCopy={(value) => { setBrowsing(false); copy("message", value); }}
          onClose={() => setBrowsing(false)}
        />
      )}
    </div>
  );
}

/**
 * One version: read it, copy it, star it. The featured one wears the green,
 * because the first thing in the dialog is what most people are there to take.
 */
function MessageCard({ v, link, fave, featured, onCopy, onFave }: {
  v: Variant; link: string; fave: boolean; featured?: boolean; onCopy: () => void; onFave: () => void;
}) {
  return (
    <div className="rounded-xl border p-3"
      style={featured
        ? { borderColor: `${GOOD}66`, background: `${GOOD}10` }
        : { borderColor: TC.line, background: "rgba(0,0,0,0.2)" }}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[12.5px] font-bold"
          style={{ color: featured ? GOOD : TC.muted }}>
          <MessageSquare size={13} /> {featured ? "The message and the link" : v.label}
        </span>
        <button type="button" onClick={onFave} aria-label={fave ? `Unstar ${v.label}` : `Star ${v.label}`}
          className="shrink-0 rounded-lg p-1 transition hover:opacity-80"
          style={{ color: fave ? "#fcd34d" : TC.faint }}>
          <Star size={14} fill={fave ? "#fcd34d" : "none"} />
        </button>
        <button type="button" onClick={onCopy}
          className="shrink-0 rounded-lg px-2.5 py-1 text-[11.5px] font-semibold transition hover:opacity-85"
          style={featured ? { background: GOOD, color: "#06231a" } : { background: "rgba(255,255,255,0.07)", color: TC.muted }}>
          <Copy size={11} className="mr-1 inline" /> Copy
        </button>
      </div>
      <pre className="mt-2 whitespace-pre-wrap font-sans text-[11.5px] leading-relaxed"
        style={{ color: featured ? TC.muted : TC.faint }}>{v.body(link)}</pre>
    </div>
  );
}

/** Shared shell so both dialogs look and behave the same. */
function Dialog({ labelledBy, wide, children, onClose }: {
  labelledBy: string; wide?: boolean; children: React.ReactNode; onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby={labelledBy}
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-5"
      style={{ background: "rgba(4,10,20,0.74)", backdropFilter: "blur(3px)" }}>
      <div className={`relative my-auto w-full rounded-2xl border p-5 ${wide ? "max-w-[520px]" : "max-w-[460px]"}`}
        style={{ borderColor: TC.line, background: TC.panel, boxShadow: "0 24px 60px rgba(0,0,0,0.55)" }}>
        <button onClick={onClose} aria-label="Close" className="absolute right-3.5 top-3.5 rounded-lg p-1 transition hover:bg-white/10" style={{ color: TC.faint }}>
          <X size={16} />
        </button>
        {children}
      </div>
    </div>
  );
}

/**
 * Copy asks what they actually want. Most people want the message — a bare link
 * in a chat gets ignored — but somebody putting it in a bio needs the link on
 * its own, and guessing wrong wastes their time either way.
 */
function CopyChoice({ link, variants, favourites, onFave, onPick, onClose }: {
  link: string;
  variants: Variant[];
  favourites: string[];
  onFave: (key: string) => void;
  onPick: (what: "link" | "message", value: string) => void;
  onClose: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const top = variants[0];

  return (
    <Dialog labelledBy="copy-title" onClose={onClose}>
      <h3 id="copy-title" className="text-[18px] font-bold tracking-tight">What do you want to copy?</h3>

      <div className="mt-4">
        <MessageCard v={top} link={link} featured
          fave={favourites.includes(top.key)}
          onCopy={() => onPick("message", top.body(link))}
          onFave={() => onFave(top.key)} />
      </div>

      {variants.length > 1 && (
        <button type="button" onClick={() => setShowAll((v) => !v)}
          className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold transition hover:opacity-80" style={{ color: A }}>
          {showAll ? "Hide other versions" : "All versions"}
          <ChevronDown size={13} className="transition" style={{ transform: showAll ? "rotate(180deg)" : undefined }} />
        </button>
      )}

      {showAll && (
        <div className="mt-2 max-h-[42vh] space-y-2 overflow-y-auto rounded-xl border p-2.5"
          style={{ borderColor: TC.line, background: "rgba(0,0,0,0.22)" }}>
          <p className="text-[11.5px] leading-relaxed" style={{ color: TC.faint }}>
            Star the one that sounds like you and it moves to the top.
          </p>
          {variants.slice(1).map((v) => (
            <MessageCard key={v.key} v={v} link={link}
              fave={favourites.includes(v.key)}
              onCopy={() => onPick("message", v.body(link))}
              onFave={() => onFave(v.key)} />
          ))}
        </div>
      )}

      <button type="button" onClick={() => onPick("link", link)}
        className="mt-2.5 w-full rounded-xl border p-3 text-left transition hover:bg-white/5"
        style={{ borderColor: TC.line, background: "rgba(0,0,0,0.22)" }}>
        <div className="flex items-center gap-1.5 text-[12.5px] font-bold" style={{ color: TC.text }}>
          <Link2 size={13} style={{ color: A }} /> Just the link
        </div>
        <div className="mt-1 truncate text-[11.5px]" style={{ ...monoFont, color: TC.muted }}>{link}</div>
        <div className="mt-1 text-[11px]" style={{ color: TC.faint }}>For your bio.</div>
      </button>
    </Dialog>
  );
}

/**
 * Every version, to read through and pick from — for when somebody is choosing
 * what to send rather than grabbing the nearest thing.
 */
function MessageLibrary({ link, variants, favourites, onFave, onCopy, onClose }: {
  link: string;
  variants: Variant[];
  favourites: string[];
  onFave: (key: string) => void;
  onCopy: (value: string) => void;
  onClose: () => void;
}) {
  return (
    <Dialog labelledBy="wordings-title" wide onClose={onClose}>
      <h3 id="wordings-title" className="text-[18px] font-bold tracking-tight">All versions</h3>
      <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
        Same link, different tone. Copy whichever suits who you are sending it to — and star the ones you keep
        coming back to, so they are waiting at the top next time.
      </p>

      <div className="mt-3.5 max-h-[58vh] space-y-2 overflow-y-auto pr-1">
        {variants.map((v, i) => (
          <MessageCard key={v.key} v={v} link={link} featured={i === 0}
            fave={favourites.includes(v.key)}
            onCopy={() => onCopy(v.body(link))}
            onFave={() => onFave(v.key)} />
        ))}
      </div>

      <button type="button" onClick={onClose}
        className="mt-4 w-full rounded-xl px-4 py-2.5 text-[13.5px] font-semibold transition hover:opacity-90"
        style={{ background: A, color: "#12091f" }}>
        Done
      </button>
    </Dialog>
  );
}

/**
 * Someone joined without using the link, and now one of them wants the credit.
 * Whichever of the two is looking at this can fix it — but they have to say
 * which way round it goes, because that is what decides who gets paid.
 */
function JoinByCode({ token, me, show, onRefresh }: {
  token: string; me: Me; show: (t: string, tone?: "ok" | "bad") => void; onRefresh: () => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [dir, setDir] = useState<"they_referred_me" | "i_referred_them">("they_referred_me");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const alreadyOnATeam = !!me.creator.referred_by;

  async function submit() {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/creators/team", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, code, direction: dir }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(data.error || "Could not do that."); return; }
      setCode("");
      show(dir === "they_referred_me" ? `You are now on ${data.name}'s team` : `${data.name} is now on your team`);
      await onRefresh();
    } catch {
      setErr("Could not reach us just now.");
    } finally { setBusy(false); }
  }

  return (
    <section className={card} style={cardStyle}>
      <h2 className={`flex items-center gap-2 ${labelCls}`} style={{ color: TC.faint }}>
        <UserPlus size={14} style={{ color: A }} /> Someone joined without the link?
      </h2>
      <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
        Swap codes and connect it here. Either of you can do it — just pick the right way round so the credit goes to
        the right person.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {([
          ["they_referred_me", "They referred me", "Their code goes in below"],
          ["i_referred_them", "I referred them", "Their code goes in below"],
        ] as const).map(([key, title, sub]) => {
          const on = dir === key;
          const blocked = key === "they_referred_me" && alreadyOnATeam;
          return (
            <button key={key} type="button" disabled={blocked} onClick={() => { setDir(key); setErr(null); }}
              className="rounded-xl border px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-45"
              style={on ? { borderColor: A, background: `${A}1a` } : { borderColor: TC.line, background: "rgba(0,0,0,0.25)" }}>
              <div className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: on ? TC.text : TC.muted }}>
                {on && <Check size={13} style={{ color: A }} />} {title}
              </div>
              <div className="mt-0.5 text-[11px]" style={{ color: TC.faint }}>
                {blocked ? "You are already on a team" : sub}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-stretch gap-2">
        <input
          value={code}
          onChange={(e) => { setCode(e.target.value.toUpperCase()); setErr(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="Their code"
          aria-label="Their code"
          maxLength={12}
          className="min-w-0 flex-1 rounded-xl border px-3 py-2.5 text-[14px] tracking-[0.14em] outline-none transition focus:border-violet-400"
          style={{ ...monoFont, borderColor: TC.line, background: "rgba(0,0,0,0.28)", color: TC.text }}
        />
        <button type="button" onClick={submit} disabled={busy || code.trim().length < 4}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
          style={{ background: A, color: "#12091f" }}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />} Connect
        </button>
      </div>

      {err && <p className="mt-2.5 text-[12.5px] font-medium" style={{ color: BAD }}>{err}</p>}

      <p className="mt-2.5 text-[11.5px] leading-relaxed" style={{ color: TC.faint }}>
        A connection is recorded once and cannot be changed afterwards, so check the direction before you press
        Connect.
      </p>
    </section>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: string }) {
  return (
    <div className="rounded-2xl border p-4" style={cardStyle}>
      <div className={labelCls} style={{ color: TC.faint }}>{label}</div>
      <div className="mt-1.5 text-[24px] font-bold leading-none" style={{ ...monoFont, color: tone }}>{value}</div>
      <div className="mt-1.5 text-[11.5px]" style={{ color: TC.faint }}>{sub}</div>
    </div>
  );
}
