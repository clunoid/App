"use client";

/**
 * CAREER DESK — the AI job-application console (admin-only at launch).
 *
 * The loop the market pays for: master resume in once → paste any job posting →
 * an HONEST deterministic ATS match score with visible keyword gaps → one-click
 * tailored resume / cover letter / recruiter outreach / interview prep (all
 * grounded — the AI never invents experience) → ATS-safe print/PDF export →
 * application tracker. Security is server-side: every byte flows through
 * /api/career/* (session + allow-list verified); this component just renders.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Briefcase, FileText, Loader2, Plus, Printer, RefreshCw, ShieldAlert,
  Sparkles, Target, Trash2, Upload, CheckCircle2, XCircle, Mail, Mic2, Copy, Check,
  ClipboardList, AlertTriangle, GraduationCap, PenLine,
} from "lucide-react";
import type { ApplicationDocs, CareerApplication, CareerProfile, DocKind, MatchItem, ResumeDoc } from "@/lib/career/types";
import { APPLICATION_STATUSES } from "@/lib/career/types";

/* palette — deep slate + a confident professional blue (distinct from Edge's emerald) */
const C = {
  bg: "#0b0e14",
  panel: "rgba(255,255,255,0.028)",
  panelHi: "rgba(255,255,255,0.055)",
  line: "rgba(255,255,255,0.09)",
  text: "#eef2f7",
  muted: "#98a2b3",
  faint: "#5f6b7c",
  accent: "#7aa5ff",
  accentDim: "rgba(122,165,255,0.14)",
  good: "#4ade80",
  goodDim: "rgba(74,222,128,0.12)",
  warn: "#fbbf24",
  warnDim: "rgba(251,191,36,0.12)",
  bad: "#f87171",
  badDim: "rgba(248,113,113,0.10)",
};
const mono = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" } as const;

const STATUS_META: Record<string, { label: string; color: string }> = {
  saved: { label: "Saved", color: C.muted },
  applied: { label: "Applied", color: C.accent },
  interviewing: { label: "Interviewing", color: C.warn },
  offer: { label: "Offer", color: C.good },
  rejected: { label: "Rejected", color: C.faint },
};

/* ── atoms ────────────────────────────────────────────────────────────────── */

function Card({ title, icon: Icon, children, className = "", action }: { title?: string; icon?: typeof Target; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <section className={`rounded-2xl border p-4 sm:p-5 ${className}`} style={{ borderColor: C.line, background: C.panel }}>
      {title && (
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: C.faint }}>
            {Icon && <Icon size={12} style={{ color: C.accent }} />} {title}
          </h3>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

function ScoreRing({ score, size = 116 }: { score: number; size?: number }) {
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  const color = score >= 80 ? C.good : score >= 60 ? C.accent : score >= 40 ? C.warn : C.bad;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={9} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={9} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.22,1,0.36,1)" }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <div className="text-[30px] font-bold leading-none" style={{ ...mono, color }}>{score}</div>
          <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.16em]" style={{ color: C.faint }}>match</div>
        </div>
      </div>
    </div>
  );
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => { void navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1600); }); }}
      className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors hover:bg-white/5"
      style={{ borderColor: C.line, color: done ? C.good : C.muted }}
    >
      {done ? <Check size={13} /> : <Copy size={13} />} {done ? "Copied" : label}
    </button>
  );
}

function Busy({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[13px]" style={{ color: C.muted }}>
      <Loader2 size={15} className="animate-spin" style={{ color: C.accent }} /> {label}
    </span>
  );
}

/** Friendly copy for gate/API errors. */
function friendly(status: number, error?: string): string {
  if (status === 401 || error === "signin") return "Sign in to use Career Desk.";
  if (status === 403 || error === "restricted") return "Career Desk is restricted.";
  if (error === "credits") return "You're out of credits — top up to keep going.";
  if (error === "rate") return "A little too fast — give it a few seconds.";
  if (error === "profile") return "Set up your master resume first.";
  return error || "Something went wrong — try again.";
}

/* ── resume rendering (shared by the in-app preview) ─────────────────────── */

function ResumeView({ r }: { r: ResumeDoc }) {
  const contact = [r.email, r.phone, r.location].filter(Boolean).join("  ·  ");
  return (
    <div className="space-y-4 text-[13.5px] leading-relaxed" style={{ color: C.text }}>
      <div>
        <div className="text-[19px] font-bold">{r.name}</div>
        <div className="text-[13px]" style={{ color: C.accent }}>{r.headline}</div>
        {(contact || r.links.length > 0) && (
          <div className="mt-0.5 text-[12px]" style={{ color: C.muted }}>{[contact, ...r.links].filter(Boolean).join("  ·  ")}</div>
        )}
      </div>
      {r.summary && <p style={{ color: C.muted }}>{r.summary}</p>}
      {r.skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {r.skills.map((s, i) => (
            <span key={i} className="rounded-md px-2 py-0.5 text-[11.5px]" style={{ background: C.panelHi, color: C.text }}>{s}</span>
          ))}
        </div>
      )}
      {r.experience.map((e, i) => (
        <div key={i}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="font-semibold">{e.title} <span style={{ color: C.muted }}>— {e.company}</span></span>
            <span className="text-[11.5px]" style={{ ...mono, color: C.faint }}>{[e.start, e.end].filter(Boolean).join(" – ")}</span>
          </div>
          <ul className="mt-1 space-y-1">
            {e.bullets.map((b, j) => (
              <li key={j} className="flex gap-2" style={{ color: C.muted }}>
                <span style={{ color: C.faint }}>•</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {r.education.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: C.faint }}>Education</div>
          {r.education.map((e, i) => (
            <div key={i} style={{ color: C.muted }}>{e.degree} — {e.school}{e.year ? ` (${e.year})` : ""}</div>
          ))}
        </div>
      )}
      {r.certifications.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: C.faint }}>Certifications</div>
          {r.certifications.map((c0, i) => (<div key={i} style={{ color: C.muted }}>{c0}</div>))}
        </div>
      )}
      {r.extras.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: C.faint }}>Additional</div>
          {r.extras.map((x, i) => (<div key={i} style={{ color: C.muted }}>{x}</div>))}
        </div>
      )}
    </div>
  );
}

/* ── the console ──────────────────────────────────────────────────────────── */

type GateState = "loading" | "signin" | "restricted" | "ready";
type View = { kind: "new" } | { kind: "app"; id: string } | { kind: "profile" };

export function CareerConsole() {
  const [gateState, setGateState] = useState<GateState>("loading");
  const [profile, setProfile] = useState<CareerProfile | null>(null);
  const [apps, setApps] = useState<CareerApplication[]>([]);
  const [view, setView] = useState<View>({ kind: "new" });
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4200);
  }, []);

  /* initial load */
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const [pRes, aRes] = await Promise.all([fetch("/api/career/profile"), fetch("/api/career/applications")]);
        if (dead) return;
        if (pRes.status === 401) return setGateState("signin");
        if (pRes.status === 403) return setGateState("restricted");
        const p = (await pRes.json()) as { profile: CareerProfile | null };
        const a = aRes.ok ? ((await aRes.json()) as { applications: CareerApplication[] }) : { applications: [] };
        setProfile(p.profile);
        setApps(a.applications || []);
        if (a.applications?.length) setView({ kind: "app", id: a.applications[0].id });
        setGateState("ready");
      } catch {
        if (!dead) setGateState("ready");
      }
    })();
    return () => { dead = true; };
  }, []);

  const selected = useMemo(() => (view.kind === "app" ? apps.find((a) => a.id === view.id) ?? null : null), [view, apps]);
  const replaceApp = useCallback((next: CareerApplication) => setApps((prev) => prev.map((a) => (a.id === next.id ? next : a))), []);

  /* ── gate screens ── */
  if (gateState === "loading") {
    return (
      <div className="grid min-h-dvh place-items-center" style={{ background: C.bg }}>
        <Busy label="Opening Career Desk…" />
      </div>
    );
  }
  if (gateState === "signin" || gateState === "restricted") {
    return (
      <div className="grid min-h-dvh place-items-center px-6" style={{ background: C.bg }}>
        <div className="max-w-md text-center">
          <ShieldAlert size={34} className="mx-auto mb-4" style={{ color: C.faint }} />
          <h1 className="text-[19px] font-semibold" style={{ color: C.text }}>
            {gateState === "signin" ? "Sign in to use Career Desk" : "Career Desk is restricted"}
          </h1>
          <p className="mt-2 text-[13.5px]" style={{ color: C.muted }}>
            {gateState === "signin" ? "Sign in from the Clunoid home page, then come back here." : "This area isn't available on your account."}
          </p>
          <Link href="/" className="mt-6 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[13.5px] font-semibold" style={{ background: C.accent, color: "#0b0e14" }}>
            <ArrowLeft size={15} /> Back to Clunoid
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh" style={{ background: C.bg }}>
      {/* header */}
      <header className="sticky top-0 z-20 border-b backdrop-blur-md" style={{ borderColor: C.line, background: "rgba(11,14,20,0.85)" }}>
        <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-1.5 text-[13px] font-medium transition-colors hover:opacity-80" style={{ color: C.muted }}>
            <ArrowLeft size={15} /> Clunoid
          </Link>
          <span className="h-4 w-px" style={{ background: C.line }} />
          <span className="flex items-center gap-2 text-[13px] font-bold tracking-[0.22em]" style={{ color: C.text }}>
            <Briefcase size={15} style={{ color: C.accent }} /> CAREER DESK
          </span>
          <span className="ml-auto" />
          {profile && (
            <button onClick={() => setView({ kind: "profile" })} className="rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors hover:bg-white/5" style={{ borderColor: C.line, color: view.kind === "profile" ? C.accent : C.muted }}>
              {profile.resume.name || "Your resume"}
            </button>
          )}
        </div>
      </header>

      {toast && (
        <div className="fixed left-1/2 top-16 z-50 -translate-x-1/2 rounded-xl border px-4 py-2.5 text-[13px] shadow-lg" style={{ borderColor: C.line, background: "#141922", color: C.text }}>
          {toast}
        </div>
      )}

      {!profile ? (
        <Onboarding onSaved={(p) => { setProfile(p); say("Resume saved — paste your first job posting."); }} say={say} />
      ) : (
        <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row">
          {/* left rail */}
          <aside className="w-full shrink-0 space-y-3 lg:w-[290px]">
            <button
              onClick={() => setView({ kind: "new" })}
              className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold transition-opacity hover:opacity-90"
              style={{ background: view.kind === "new" ? C.accent : C.accentDim, color: view.kind === "new" ? "#0b0e14" : C.accent }}
            >
              <Plus size={15} /> New application
            </button>
            <Card title={`Applications · ${apps.length}`} icon={ClipboardList}>
              {apps.length === 0 ? (
                <p className="text-[12.5px]" style={{ color: C.faint }}>Paste your first job posting to get a match score.</p>
              ) : (
                <div className="-mx-1 max-h-[52dvh] space-y-1 overflow-y-auto px-1 lg:max-h-[62dvh]">
                  {apps.map((a) => {
                    const active = view.kind === "app" && view.id === a.id;
                    const score = a.match?.score ?? 0;
                    const sc = score >= 80 ? C.good : score >= 60 ? C.accent : score >= 40 ? C.warn : C.bad;
                    return (
                      <button key={a.id} onClick={() => setView({ kind: "app", id: a.id })} className="block w-full rounded-xl border p-2.5 text-left transition-colors" style={{ borderColor: active ? C.accent : "transparent", background: active ? C.panelHi : "transparent" }}>
                        <div className="flex items-center gap-2.5">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[12.5px] font-bold" style={{ ...mono, background: `${sc}1a`, color: sc }}>{score}</span>
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-semibold" style={{ color: C.text }}>{a.role || "Role"}</span>
                            <span className="block truncate text-[11.5px]" style={{ color: C.faint }}>
                              {a.company || "—"} · <span style={{ color: STATUS_META[a.status].color }}>{STATUS_META[a.status].label}</span>
                            </span>
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </Card>
          </aside>

          {/* main pane */}
          <main className="min-w-0 flex-1">
            {view.kind === "profile" && <ProfilePane profile={profile} onSaved={(p) => { setProfile(p); say("Resume updated — use Rescore on existing applications."); }} say={say} />}
            {view.kind === "new" && (
              <NewApplication
                onCreated={(a) => { setApps((prev) => [a, ...prev]); setView({ kind: "app", id: a.id }); }}
                say={say}
              />
            )}
            {view.kind === "app" && selected && (
              <ApplicationDetail
                app={selected}
                onUpdated={replaceApp}
                onDeleted={(id) => { setApps((prev) => prev.filter((a) => a.id !== id)); setView({ kind: "new" }); }}
                say={say}
              />
            )}
            {view.kind === "app" && !selected && <p className="p-8 text-[13px]" style={{ color: C.faint }}>Application not found.</p>}
          </main>
        </div>
      )}
    </div>
  );
}

/* ── onboarding / profile intake ─────────────────────────────────────────── */

function ResumeIntake({ compact, onSaved, say }: { compact?: boolean; onSaved: (p: CareerProfile) => void; say: (m: string) => void }) {
  const [text, setText] = useState("");
  const [pdf, setPdf] = useState<{ name: string; base64: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const pickPdf = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 4 * 1024 * 1024) return say("PDF too large — keep it under 4MB.");
    const rd = new FileReader();
    rd.onload = () => {
      const url = String(rd.result || "");
      const base64 = url.slice(url.indexOf(",") + 1);
      setPdf({ name: f.name, base64 });
    };
    rd.readAsDataURL(f);
  };

  const save = async () => {
    if (!text.trim() && !pdf) return say("Paste your resume text or upload a PDF.");
    setBusy(true);
    try {
      const res = await fetch("/api/career/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: text.trim() || undefined, pdfBase64: pdf?.base64 }),
      });
      const d = (await res.json()) as { profile?: CareerProfile; error?: string };
      if (!res.ok || !d.profile) return say(friendly(res.status, d.error));
      onSaved(d.profile);
    } catch {
      say("Network hiccup — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={compact ? 8 : 12}
        placeholder="Paste the full text of your resume here…"
        className="w-full resize-y rounded-xl border bg-transparent p-3.5 text-[13.5px] leading-relaxed outline-none transition-colors focus:border-white/25"
        style={{ borderColor: C.line, color: C.text }}
      />
      <div className="flex flex-wrap items-center gap-2.5">
        <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => pickPdf(e.target.files?.[0])} />
        <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-[13px] font-medium transition-colors hover:bg-white/5" style={{ borderColor: C.line, color: C.muted }}>
          <Upload size={14} /> {pdf ? pdf.name : "Upload PDF instead"}
        </button>
        {pdf && (
          <button onClick={() => { setPdf(null); if (fileRef.current) fileRef.current.value = ""; }} className="text-[12px]" style={{ color: C.faint }}>remove</button>
        )}
        <button onClick={() => void save()} disabled={busy} className="ml-auto inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[13.5px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50" style={{ background: C.accent, color: "#0b0e14" }}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} {busy ? "Reading your resume…" : "Save my resume"}
        </button>
      </div>
    </div>
  );
}

function Onboarding({ onSaved, say }: { onSaved: (p: CareerProfile) => void; say: (m: string) => void }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <div className="mb-8 text-center">
        <span className="mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ borderColor: C.line, color: C.accent }}>
          <Target size={12} /> ATS match scoring · honest AI
        </span>
        <h1 className="text-[26px] font-bold leading-tight sm:text-[32px]" style={{ color: C.text }}>Land your next role.</h1>
        <p className="mx-auto mt-3 max-w-lg text-[14px] leading-relaxed" style={{ color: C.muted }}>
          Add your resume once. Then for every job posting: a deterministic match score with the exact keyword gaps,
          a tailored resume that never invents experience, a cover letter, recruiter outreach and interview prep.
        </p>
      </div>
      <Card title="Your master resume" icon={FileText}>
        <ResumeIntake onSaved={onSaved} say={say} />
      </Card>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {[
          { icon: Target, t: "Honest scoring", d: "The score is computed, not vibes — every lost point has a visible reason." },
          { icon: PenLine, t: "Never fabricates", d: "Tailoring rephrases your real experience. Gaps become advice, not lies." },
          { icon: Mic2, t: "Interview-ready", d: "Likely questions with STAR outlines built from your actual work." },
        ].map(({ icon: I, t, d }) => (
          <div key={t} className="rounded-xl border p-3.5" style={{ borderColor: C.line, background: C.panel }}>
            <I size={15} style={{ color: C.accent }} />
            <div className="mt-2 text-[13px] font-semibold" style={{ color: C.text }}>{t}</div>
            <div className="mt-1 text-[12px] leading-relaxed" style={{ color: C.faint }}>{d}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProfilePane({ profile, onSaved, say }: { profile: CareerProfile; onSaved: (p: CareerProfile) => void; say: (m: string) => void }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="space-y-4">
      <Card
        title="Master resume"
        icon={FileText}
        action={
          <button onClick={() => setEditing((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors hover:bg-white/5" style={{ borderColor: C.line, color: C.muted }}>
            <RefreshCw size={12} /> {editing ? "Cancel" : "Replace resume"}
          </button>
        }
      >
        {editing ? (
          <ResumeIntake compact onSaved={(p) => { setEditing(false); onSaved(p); }} say={say} />
        ) : (
          <ResumeView r={profile.resume} />
        )}
      </Card>
    </div>
  );
}

/* ── new application ─────────────────────────────────────────────────────── */

function NewApplication({ onCreated, say }: { onCreated: (a: CareerApplication) => void; say: (m: string) => void }) {
  const [jd, setJd] = useState("");
  const [busy, setBusy] = useState(false);

  const analyze = async () => {
    if (jd.trim().length < 80) return say("Paste the full job description first.");
    setBusy(true);
    try {
      const res = await fetch("/api/career/applications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jd: jd.trim() }) });
      const d = (await res.json()) as { application?: CareerApplication; error?: string };
      if (!res.ok || !d.application) return say(friendly(res.status, d.error));
      setJd("");
      onCreated(d.application);
    } catch {
      say("Network hiccup — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="New application" icon={Plus}>
      <p className="mb-3 text-[13px]" style={{ color: C.muted }}>
        Paste the full job posting. You&apos;ll get a deterministic match score against your resume, with the exact keyword gaps.
      </p>
      <textarea
        value={jd}
        onChange={(e) => setJd(e.target.value)}
        rows={14}
        placeholder="Paste the job description here — title, requirements, responsibilities, everything…"
        className="w-full resize-y rounded-xl border bg-transparent p-3.5 text-[13.5px] leading-relaxed outline-none transition-colors focus:border-white/25"
        style={{ borderColor: C.line, color: C.text }}
      />
      <div className="mt-3 flex justify-end">
        <button onClick={() => void analyze()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13.5px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50" style={{ background: C.accent, color: "#0b0e14" }}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Target size={15} />} {busy ? "Analyzing the posting…" : "Analyze match"}
        </button>
      </div>
    </Card>
  );
}

/* ── application detail ──────────────────────────────────────────────────── */

const DOC_TABS: { kind: DocKind; label: string; icon: typeof FileText; blurb: string; cta: string }[] = [
  { kind: "resume", label: "Tailored resume", icon: FileText, blurb: "Your real experience, rewritten for THIS job: relevant bullets first, the posting's terminology where you genuinely have it, everything grounded — plus a change log and honesty warnings.", cta: "Generate tailored resume" },
  { kind: "cover", label: "Cover letter", icon: Mail, blurb: "A specific, factual letter a hiring manager will actually finish: why this role, your 2-3 hardest-mapping proof points, a confident close.", cta: "Generate cover letter" },
  { kind: "outreach", label: "Outreach", icon: Sparkles, blurb: "A LinkedIn note and a short email to the recruiter/hiring manager — short, specific, easy to say yes to.", cta: "Generate outreach" },
  { kind: "interview", label: "Interview prep", icon: Mic2, blurb: "The questions this posting implies, STAR answer outlines built from your actual experience, smart questions to ask, and salary notes.", cta: "Build interview pack" },
];

function ApplicationDetail({ app, onUpdated, onDeleted, say }: { app: CareerApplication; onUpdated: (a: CareerApplication) => void; onDeleted: (id: string) => void; say: (m: string) => void }) {
  const [tab, setTab] = useState<DocKind>("resume");
  const [genBusy, setGenBusy] = useState<DocKind | null>(null);
  const [rescoreBusy, setRescoreBusy] = useState(false);
  const [notes, setNotes] = useState(app.notes);
  useEffect(() => setNotes(app.notes), [app.id, app.notes]);

  const patch = async (body: Record<string, unknown>, busySetter?: (v: boolean) => void) => {
    busySetter?.(true);
    try {
      const res = await fetch(`/api/career/applications/${app.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const d = (await res.json()) as { application?: CareerApplication; error?: string };
      if (!res.ok || !d.application) return say(friendly(res.status, d.error));
      onUpdated(d.application);
    } catch {
      say("Network hiccup — try again.");
    } finally {
      busySetter?.(false);
    }
  };

  const generate = async (kind: DocKind) => {
    setGenBusy(kind);
    try {
      const res = await fetch(`/api/career/applications/${app.id}/generate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind }) });
      const d = (await res.json()) as { application?: CareerApplication; error?: string };
      if (!res.ok || !d.application) return say(friendly(res.status, d.error));
      onUpdated(d.application);
    } catch {
      say("Network hiccup — try again.");
    } finally {
      setGenBusy(null);
    }
  };

  const del = async () => {
    if (!confirm("Delete this application and its documents?")) return;
    const res = await fetch(`/api/career/applications/${app.id}`, { method: "DELETE" });
    if (res.ok) onDeleted(app.id);
    else say("Delete failed — try again.");
  };

  const m = app.match;
  const req = app.requirements;

  return (
    <div className="space-y-4">
      {/* header */}
      <section className="rounded-2xl border p-4 sm:p-5" style={{ borderColor: C.line, background: C.panelHi }}>
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-[18px] font-bold leading-tight" style={{ color: C.text }}>{app.role || "Role"}</h2>
            <p className="mt-0.5 text-[13px]" style={{ color: C.muted }}>
              {app.company || "Company"}{req?.location ? ` · ${req.location}` : ""}{req?.salaryText ? ` · ${req.salaryText}` : ""}
            </p>
          </div>
          <select
            value={app.status}
            onChange={(e) => void patch({ status: e.target.value })}
            className="rounded-lg border bg-transparent px-2.5 py-1.5 text-[12.5px] font-medium outline-none"
            style={{ borderColor: C.line, color: STATUS_META[app.status].color, background: C.bg }}
          >
            {APPLICATION_STATUSES.map((s) => (
              <option key={s} value={s} style={{ color: "#111", background: "#fff" }}>{STATUS_META[s].label}</option>
            ))}
          </select>
          <button onClick={() => void del()} className="rounded-lg border p-2 transition-colors hover:bg-white/5" style={{ borderColor: C.line, color: C.faint }} title="Delete application">
            <Trash2 size={14} />
          </button>
        </div>
      </section>

      {/* score */}
      {m && (
        <Card
          title="Match analysis"
          icon={Target}
          action={
            <button onClick={() => void patch({ rescore: true }, setRescoreBusy)} disabled={rescoreBusy} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors hover:bg-white/5 disabled:opacity-50" style={{ borderColor: C.line, color: C.muted }} title="Re-run the deterministic score against your current resume (free)">
              {rescoreBusy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Rescore
            </button>
          }
        >
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <ScoreRing score={m.score} />
            <div className="min-w-0 flex-1 space-y-2.5">
              <p className="text-[14px] font-medium leading-relaxed" style={{ color: C.text }}>{m.verdict}</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "required", hit: m.requiredHit, total: m.requiredTotal },
                  { label: "preferred", hit: m.preferredHit, total: m.preferredTotal },
                  { label: "keywords", hit: m.keywordHit, total: m.keywordTotal },
                ].filter((b) => b.total > 0).map((b) => (
                  <span key={b.label} className="rounded-lg px-2.5 py-1 text-[12px] font-medium" style={{ ...mono, background: C.panelHi, color: b.hit === b.total ? C.good : b.hit >= b.total / 2 ? C.warn : C.bad }}>
                    {b.hit}/{b.total} {b.label}
                  </span>
                ))}
                <span className="rounded-lg px-2.5 py-1 text-[12px] font-medium" style={{ ...mono, background: C.panelHi, color: m.titleAligned ? C.good : C.faint }}>
                  title {m.titleAligned ? "aligned" : "differs"}
                </span>
              </div>
            </div>
          </div>

          {/* hit/miss table — the conversion engine */}
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: C.good }}>
                <CheckCircle2 size={13} /> Matched · {m.items.filter((i) => i.hit).length}
              </div>
              <div className="space-y-1.5">
                {m.items.filter((i) => i.hit).map((i, idx) => (
                  <MatchRow key={idx} item={i} />
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: C.bad }}>
                <XCircle size={13} /> Missing · {m.items.filter((i) => !i.hit).length}
              </div>
              <div className="space-y-1.5">
                {m.items.filter((i) => !i.hit).map((i, idx) => (
                  <MatchRow key={idx} item={i} />
                ))}
                {m.items.every((i) => i.hit) && <p className="text-[12.5px]" style={{ color: C.faint }}>Nothing missing — full coverage.</p>}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* documents */}
      <Card title="Documents" icon={FileText}>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {DOC_TABS.map(({ kind, label, icon: I }) => {
            const has = !!app.docs[kind];
            return (
              <button key={kind} onClick={() => setTab(kind)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors" style={{ background: tab === kind ? C.accentDim : "transparent", color: tab === kind ? C.accent : has ? C.text : C.faint }}>
                <I size={13} /> {label} {has && <span className="h-1.5 w-1.5 rounded-full" style={{ background: C.good }} />}
              </button>
            );
          })}
        </div>
        <DocPane app={app} kind={tab} busy={genBusy === tab} onGenerate={() => void generate(tab)} />
      </Card>

      {/* notes */}
      <Card title="Notes" icon={GraduationCap}>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => { if (notes !== app.notes) void patch({ notes }); }}
          rows={3}
          placeholder="Recruiter names, dates, follow-ups…"
          className="w-full resize-y rounded-xl border bg-transparent p-3 text-[13px] leading-relaxed outline-none transition-colors focus:border-white/25"
          style={{ borderColor: C.line, color: C.text }}
        />
      </Card>
    </div>
  );
}

function MatchRow({ item }: { item: MatchItem }) {
  const kindColor = item.kind === "required" ? C.bad : item.kind === "preferred" ? C.warn : C.faint;
  return (
    <div className="rounded-lg border px-2.5 py-1.5" style={{ borderColor: C.line, background: item.hit ? C.goodDim : item.kind === "required" ? C.badDim : "transparent" }}>
      <div className="flex items-center gap-2">
        <span className="text-[12.5px] font-medium" style={{ color: C.text }}>{item.term}</span>
        <span className="ml-auto rounded px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider" style={{ color: item.hit ? C.faint : kindColor, background: "rgba(255,255,255,0.05)" }}>{item.kind}</span>
      </div>
      {item.hit && item.evidence && (
        <div className="mt-0.5 truncate text-[11px]" style={{ color: C.faint }} title={item.evidence}>“{item.evidence}”</div>
      )}
    </div>
  );
}

/* ── document panes ──────────────────────────────────────────────────────── */

function GenerateCta({ blurb, cta, busy, onGenerate }: { blurb: string; cta: string; busy: boolean; onGenerate: () => void }) {
  return (
    <div className="rounded-xl border border-dashed p-6 text-center" style={{ borderColor: C.line }}>
      <p className="mx-auto max-w-md text-[13px] leading-relaxed" style={{ color: C.muted }}>{blurb}</p>
      <button onClick={onGenerate} disabled={busy} className="mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-60" style={{ background: C.accent, color: "#0b0e14" }}>
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} {busy ? "Writing…" : cta}
      </button>
    </div>
  );
}

function RegenRow({ busy, onGenerate, extra }: { busy: boolean; onGenerate: () => void; extra?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {extra}
      <button onClick={onGenerate} disabled={busy} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors hover:bg-white/5 disabled:opacity-50" style={{ borderColor: C.line, color: C.muted }}>
        {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Regenerate
      </button>
    </div>
  );
}

function DocPane({ app, kind, busy, onGenerate }: { app: CareerApplication; kind: DocKind; busy: boolean; onGenerate: () => void }) {
  const docs: ApplicationDocs = app.docs || {};
  const meta = DOC_TABS.find((t) => t.kind === kind)!;

  if (busy && !docs[kind]) return <div className="grid place-items-center rounded-xl border border-dashed p-10" style={{ borderColor: C.line }}><Busy label={kind === "resume" ? "Tailoring your resume (this one runs the strongest model)…" : "Writing…"} /></div>;
  if (!docs[kind]) return <GenerateCta blurb={meta.blurb} cta={meta.cta} busy={busy} onGenerate={onGenerate} />;

  if (kind === "resume") {
    const t = docs.resume!;
    return (
      <div>
        <RegenRow
          busy={busy}
          onGenerate={onGenerate}
          extra={
            <a href={`/career/print/${app.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-opacity hover:opacity-90" style={{ background: C.accent, color: "#0b0e14" }}>
              <Printer size={13} /> Print / Save as PDF
            </a>
          }
        />
        {t.warnings.length > 0 && (
          <div className="mb-3 rounded-xl border p-3" style={{ borderColor: "rgba(251,191,36,0.35)", background: C.warnDim }}>
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: C.warn }}>
              <AlertTriangle size={12} /> Honesty check
            </div>
            <ul className="space-y-1 text-[12.5px] leading-relaxed" style={{ color: C.muted }}>
              {t.warnings.map((w, i) => (<li key={i}>• {w}</li>))}
            </ul>
          </div>
        )}
        <div className="rounded-xl border p-4 sm:p-5" style={{ borderColor: C.line, background: "rgba(255,255,255,0.015)" }}>
          <ResumeView r={t.resume} />
        </div>
        {t.changes.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-[12.5px] font-medium" style={{ color: C.accent }}>What changed and why · {t.changes.length}</summary>
            <ul className="mt-2 space-y-1 text-[12.5px] leading-relaxed" style={{ color: C.muted }}>
              {t.changes.map((c0, i) => (<li key={i}>• {c0}</li>))}
            </ul>
          </details>
        )}
      </div>
    );
  }

  if (kind === "cover") {
    return (
      <div>
        <RegenRow busy={busy} onGenerate={onGenerate} extra={<CopyButton text={docs.cover!} label="Copy letter" />} />
        <div className="whitespace-pre-wrap rounded-xl border p-4 text-[13.5px] leading-relaxed sm:p-5" style={{ borderColor: C.line, background: "rgba(255,255,255,0.015)", color: C.text }}>
          {docs.cover}
        </div>
      </div>
    );
  }

  if (kind === "outreach") {
    const o = docs.outreach!;
    return (
      <div className="space-y-3">
        <RegenRow busy={busy} onGenerate={onGenerate} />
        <div className="rounded-xl border p-4" style={{ borderColor: C.line, background: "rgba(255,255,255,0.015)" }}>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: C.faint }}>LinkedIn message</span>
            <CopyButton text={o.linkedin} />
          </div>
          <p className="text-[13.5px] leading-relaxed" style={{ color: C.text }}>{o.linkedin}</p>
        </div>
        <div className="rounded-xl border p-4" style={{ borderColor: C.line, background: "rgba(255,255,255,0.015)" }}>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: C.faint }}>Email</span>
            <CopyButton text={`Subject: ${o.emailSubject}\n\n${o.email}`} />
          </div>
          <p className="text-[13px] font-semibold" style={{ color: C.text }}>Subject: {o.emailSubject}</p>
          <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed" style={{ color: C.text }}>{o.email}</p>
        </div>
      </div>
    );
  }

  const ip = docs.interview!;
  return (
    <div className="space-y-3">
      <RegenRow busy={busy} onGenerate={onGenerate} />
      {ip.questions.map((q, i) => (
        <details key={i} className="rounded-xl border p-4" style={{ borderColor: C.line, background: "rgba(255,255,255,0.015)" }}>
          <summary className="cursor-pointer text-[13.5px] font-semibold leading-relaxed" style={{ color: C.text }}>
            {i + 1}. {q.q}
          </summary>
          <p className="mt-2 text-[12px] italic" style={{ color: C.faint }}>{q.why}</p>
          <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed" style={{ color: C.muted }}>{q.answerOutline}</p>
        </details>
      ))}
      <div className="rounded-xl border p-4" style={{ borderColor: C.line, background: "rgba(255,255,255,0.015)" }}>
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: C.faint }}>Questions to ask them</div>
        <ul className="space-y-1 text-[13.5px] leading-relaxed" style={{ color: C.text }}>
          {ip.questionsToAsk.map((q, i) => (<li key={i}>• {q}</li>))}
        </ul>
      </div>
      <div className="rounded-xl border p-4" style={{ borderColor: C.line, background: "rgba(255,255,255,0.015)" }}>
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: C.faint }}>Salary notes</div>
        <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed" style={{ color: C.text }}>{ip.salaryNotes}</p>
      </div>
    </div>
  );
}
