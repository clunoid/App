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
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Users, Copy, Check, Link2, Share2, ShieldCheck, Clock } from "lucide-react";
import { TC, monoFont } from "@/lib/trading/theme";
import { A, GOOD, fmt } from "./content";
import type { Me } from "./CreatorDashboard";

const card = "rounded-2xl border p-4 sm:p-5";
const cardStyle = { borderColor: TC.line, background: TC.panel } as const;
const labelCls = "text-[10.5px] font-semibold uppercase tracking-wider";
const money = (n: number) => `$${n.toFixed(0)}`;

export function TeamPanel({ me, show }: { me: Me; show: (t: string, tone?: "ok" | "bad") => void }) {
  const { creator, team, teamTotals } = me;
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [origin, setOrigin] = useState("https://clunoid.com");

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, []);

  const code = creator.referral_code ?? "";
  const link = code ? `${origin}/r/${code}` : "";

  const copy = useCallback(async (what: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      show(what === "link" ? "Link copied — put it in your bio" : "Code copied");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(null), 1600);
    } catch {
      show("Could not copy — select it and copy by hand.", "bad");
    }
  }, [show]);

  async function share() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "Free AI trading bots", text: "Free automated trading bots — have a look:", url: link });
        return;
      } catch { /* they closed the sheet */ }
    }
    copy("link", link);
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
          <button type="button" onClick={() => copy("link", link)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-[12.5px] font-semibold transition hover:opacity-90"
            style={{ background: copied === "link" ? GOOD : A, color: copied === "link" ? "#06231a" : "#12091f" }}>
            {copied === "link" ? <Check size={14} /> : <Copy size={14} />} {copied === "link" ? "Copied" : "Copy"}
          </button>
          <button type="button" onClick={share}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3.5 py-2.5 text-[12.5px] font-semibold transition hover:bg-white/5"
            style={{ borderColor: TC.line, color: TC.text }}>
            <Share2 size={14} /> Share
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

        {/* the real reason this matters */}
        <div className="mt-4 rounded-xl border p-3" style={{ borderColor: `${GOOD}44`, background: `${GOOD}10` }}>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: GOOD }}>
            <ShieldCheck size={13} /> Use this link in your bios, not clunoid.com
          </div>
          <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: TC.muted }}>
            Put <b style={{ color: TC.text }}>your own link</b> in the bio of all three profiles instead of the plain
            address. It opens clunoid.com exactly the same, so &ldquo;link in bio&rdquo; is still true — but hundreds
            of accounts all carrying the identical URL is what gets a domain flagged as spam. Your own link protects
            the platform and credits you at the same time.
          </p>
        </div>
      </section>

      {/* ── the numbers ───────────────────────────────────────────────────── */}
      <section className="grid gap-3 sm:grid-cols-3">
        <Stat label="People you brought" value={String(teamTotals.members)} sub="Joined through your link" tone={A} />
        <Stat label="Earned from your team" value={money(teamTotals.earnedUsd)} sub={teamTotals.earning === 1 ? "1 of them has been paid" : `${teamTotals.earning} of them have been paid`} tone={GOOD} />
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
            <table className="w-full min-w-[380px] border-collapse text-left">
              <thead>
                <tr>
                  {["Name", "Joined", "Status", "You earn"].map((h) => (
                    <th key={h} className={`pb-2 ${labelCls}`} style={{ color: TC.faint }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {team.map((m, i) => (
                  <tr key={`${m.name}-${m.joined}-${i}`} className="border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                    <td className="py-2 text-[13px] font-medium">{m.name}</td>
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
    </div>
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
