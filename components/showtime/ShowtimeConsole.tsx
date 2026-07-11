"use client";

/**
 * SHOWTIME director console — admin mission control for the live stage.
 *
 * The STAGE (at /showtime/stage#k=..&s=..) owns the Euler socket and the game sim;
 * this console never touches Euler directly. It monitors, commands, and simulates
 * over the Supabase Realtime bus: publishCommand() drives connect/disconnect on the
 * stage, onStatus() receives the 1/s StageStatus heartbeat, and publishEvent()
 * injects simulator events (ALWAYS sim:true — excluded from persistence).
 *
 * Layout mirrors the Trading desk (full-bleed dark product surface, sticky top bar,
 * back link flush top-left) but this is its own product: slate-dark with the war's
 * team colors — crimson #E5484D vs cobalt #3E63DD — as the only accents.
 *
 * Three columns: CONTROL (go live · OBS output · war monitor), LIVE PREVIEW (a 9:16
 * iframe of the real stage in preview mode + event log), SIMULATOR (gift/interaction/
 * scenario injectors + the all-time board from /api/showtime/persist op:top).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Play,
  Radio,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { createBus, stageKey, type ShowtimeBus } from "@/lib/showtime/bus";
import { consoleCreds, type StageCreds } from "@/lib/showtime/stagecreds";
import { SIM_GIFTS, chatEvent, giftEvent, likeEvent, makeUser, socialEvent, tierForCoins, usdForCoins } from "@/lib/showtime/gifts";
import type { EvUser, FeedStatus, GifterRow, GiftTier, MonumentRow, ShowEvent, StageStatus } from "@/lib/showtime/types";

/* ── palette (console-local; deliberately its own surface) ──────────────── */
const C = {
  ground: "#0a0c11",
  panel: "#10131b",
  inset: "rgba(0,0,0,0.32)",
  line: "rgba(148,163,184,0.13)",
  text: "#e7eaf1",
  muted: "#8b93a7",
  faint: "#596174",
  crimson: "#E5484D",
  cobalt: "#3E63DD",
  green: "#3DD68C",
  amber: "#F0B429",
};

const TIER_COLOR: Record<GiftTier, string> = {
  0: "#8b93a7", // gray
  1: "#38bdf8", // sky
  2: "#34d399", // emerald
  3: "#a78bfa", // violet
  4: "#f5b944", // amber
};

const FEED_PILL: Record<FeedStatus, { label: string; color: string }> = {
  idle: { label: "Offline", color: "#8b93a7" },
  connecting: { label: "Connecting…", color: "#F0B429" },
  live: { label: "Live", color: "#3DD68C" },
  error: { label: "Feed error", color: "#E5484D" },
  unconfigured: { label: "Set-up needed", color: "#8b93a7" },
};

/** Rotating fake senders for simulator events with no handle typed in. */
const FAKE_HANDLES = ["nova_x", "jaydee", "miko.wav", "kairo.fm", "zetsu", "pixel.pri", "lu_na", "dash.void"];

const RUSH_CHATS = ["lets race!", "im in!!", "GO GO GO", "this is wild", "who's winning??", "catch me if you can", "beach day!!", "photo finish incoming"];

/* ── tiny formatters ────────────────────────────────────────────────────── */
const pad2 = (n: number) => String(n).padStart(2, "0");
const fmtDur = (secs: number): string => {
  const s = Math.max(0, Math.floor(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s % 60)}` : `${m}:${pad2(s % 60)}`;
};
const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");
const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString("en-GB", { hour12: false });

/* ── small building blocks ──────────────────────────────────────────────── */

function Pill({ color, label, pulse }: { color: string; label: string; pulse?: boolean }) {
  return (
    <span
      className="flex max-w-[340px] items-center gap-1.5 truncate rounded-full border px-2.5 py-1 text-[12px] font-medium"
      style={{ color, borderColor: C.line, background: C.inset }}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${pulse ? "animate-pulse" : ""}`} style={{ background: color }} />
      <span className="truncate">{label}</span>
    </span>
  );
}

function Card({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border" style={{ borderColor: C.line, background: C.panel }}>
      <header className="flex items-center gap-2 border-b px-4 py-2.5" style={{ borderColor: C.line }}>
        {icon}
        <h2 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: C.faint }}>{title}</h2>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-md px-2.5 py-1.5" style={{ background: C.inset }}>
      <div className="text-[9px] uppercase tracking-wider" style={{ color: C.faint }}>{k}</div>
      <div className="text-[13px] font-bold tabular-nums" style={{ color: C.text }}>{v}</div>
    </div>
  );
}

/** One-line description of a bus event for the compact log. */
function describeEvent(ev: ShowEvent): string {
  switch (ev.type) {
    case "gift":
      return `sent ${ev.giftName || "a gift"}${ev.count > 1 ? ` ×${ev.count}` : ""} · ${fmtInt(ev.value)} coins`;
    case "chat":
      return `“${ev.text ?? ""}”`;
    case "like":
      return `liked ×${ev.count}`;
    case "follow":
      return "followed";
    case "share":
      return "shared the LIVE";
    case "join":
      return "joined";
    case "room":
      return `viewers → ${fmtInt(ev.value)}`;
  }
}

type TopGifter = Pick<GifterRow, "id" | "name" | "avatar_url" | "total_coins" | "wars" | "best_rank">;
type TopBoard = { gifters: TopGifter[]; monuments: MonumentRow[] };

/* ── the console ────────────────────────────────────────────────────────── */

export function ShowtimeConsole() {
  const busRef = useRef<ShowtimeBus | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fakeIdxRef = useRef(0);
  const logIdRef = useRef(0);
  const senderRef = useRef("");
  const phaseRef = useRef<{ name: string; since: number }>({ name: "", since: Date.now() });

  const [creds, setCreds] = useState<StageCreds | null>(null);
  const [credsPending, setCredsPending] = useState(true);
  const [room, setRoom] = useState("");
  const [cmdMsg, setCmdMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<StageStatus | null>(null);
  const [lastStatusAt, setLastStatusAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [log, setLog] = useState<{ id: number; ev: ShowEvent }[]>([]);
  const [sender, setSender] = useState("");
  const [simNote, setSimNote] = useState("");
  const [board, setBoard] = useState<TopBoard | null>(null);
  const [boardPending, setBoardPending] = useState(true);

  /* mount: bus + creds + saved room + 1s clock + all-time board */
  useEffect(() => {
    const b = createBus(stageKey());
    busRef.current = b;
    const offEv = b.onEvent((ev) => {
      setLog((prev) => [{ id: ++logIdRef.current, ev }, ...prev].slice(0, 12));
    });
    const offSt = b.onStatus((s) => {
      if (s.phase !== phaseRef.current.name) phaseRef.current = { name: s.phase, since: Date.now() };
      setStatus(s);
      setLastStatusAt(Date.now());
    });

    try {
      const saved = localStorage.getItem("showtime_room");
      if (saved) setRoom(saved);
    } catch {
      /* ignore */
    }

    void consoleCreds().then((c) => {
      setCreds(c);
      setCredsPending(false);
    });

    void fetch("/api/showtime/persist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "top" }),
    })
      .then(async (res) => (res.ok ? ((await res.json()) as TopBoard) : null))
      .then((d) => setBoard(d && Array.isArray(d.gifters) ? d : null))
      .catch(() => setBoard(null))
      .finally(() => setBoardPending(false));

    const clock = setInterval(() => setNow(Date.now()), 1000);

    return () => {
      offEv();
      offSt();
      b.close();
      clearInterval(clock);
      for (const t of timersRef.current) clearTimeout(t);
      timersRef.current = [];
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  /* ── commands ── */
  const connect = useCallback(() => {
    const r = room.trim().replace(/^@/, "");
    if (!r) return;
    try {
      localStorage.setItem("showtime_room", r);
    } catch {
      /* ignore */
    }
    busRef.current?.publishCommand({ cmd: "connect", room: r });
    setCmdMsg(`Connect sent — the stage is dialing @${r}.`);
  }, [room]);

  const disconnect = useCallback(() => {
    busRef.current?.publishCommand({ cmd: "disconnect" });
    setCmdMsg("Disconnect sent.");
  }, []);

  /* ── OBS URL ── */
  const stageHash = creds ? `#k=${creds.k}&s=${creds.s}` : "";
  const copyObs = useCallback(async () => {
    if (!creds) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/showtime/stage#k=${creds.k}&s=${creds.s}`);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      setCopied(true);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }, [creds]);

  /* ── simulator ── */
  const simUser = useCallback((): EvUser => {
    const typed = senderRef.current.trim();
    if (typed) return makeUser(typed);
    const h = FAKE_HANDLES[fakeIdxRef.current++ % FAKE_HANDLES.length];
    return makeUser(h);
  }, []);

  const later = useCallback((fn: () => void, ms: number) => {
    timersRef.current.push(setTimeout(fn, ms));
  }, []);

  const sendGift = useCallback(
    (unitCoins: number, count: number, name?: string) => {
      busRef.current?.publishEvent(giftEvent(simUser(), unitCoins, count, name, true));
    },
    [simUser],
  );

  const sendChat = useCallback(
    (text: string) => busRef.current?.publishEvent(chatEvent(simUser(), text, true)),
    [simUser],
  );

  const scenarioFlood = useCallback(() => {
    setSimNote("Gift flood: 12 small gifts over 4s.");
    for (let i = 0; i < 12; i++) {
      later(() => {
        const roll = Math.random();
        if (roll < 0.6) sendGift(1, 1 + Math.floor(Math.random() * 15), "Rose");
        else if (roll < 0.85) sendGift(20, 1, "Perfume");
        else sendGift(99, 1, "Paper Crane");
      }, Math.round((i * 4000) / 12));
    }
  }, [later, sendGift]);

  const scenarioWhale = useCallback(() => {
    setSimNote("Whale moment: one 29,999-coin Lion.");
    sendGift(29999, 1, "Lion");
  }, [sendGift]);

  const scenarioRush = useCallback(() => {
    setSimNote("Rush hour: 30 mixed events over 6s.");
    for (let i = 0; i < 30; i++) {
      later(() => {
        const roll = Math.random();
        if (roll < 0.45) {
          const g = SIM_GIFTS[Math.floor(Math.random() * 7)]; // small-to-mid presets
          sendGift(g.unitCoins, g.count, g.label);
        } else if (roll < 0.7) {
          sendChat(RUSH_CHATS[Math.floor(Math.random() * RUSH_CHATS.length)]);
        } else if (roll < 0.85) {
          busRef.current?.publishEvent(likeEvent(simUser(), 10 + Math.floor(Math.random() * 70), true));
        } else if (roll < 0.92) {
          busRef.current?.publishEvent(socialEvent("follow", simUser(), true));
        } else if (roll < 0.97) {
          busRef.current?.publishEvent(socialEvent("share", simUser(), true));
        } else {
          busRef.current?.publishEvent(socialEvent("join", simUser(), true));
        }
      }, Math.round((i * 6000) / 30));
    }
  }, [later, sendChat, sendGift, simUser]);

  const scenarioQuiet = useCallback(() => {
    setSimNote("Quiet room: send nothing — the stage enters idle/attract mode after 90s without human events (house bots are always labeled).");
  }, []);

  /* ── derived health ── */
  const statusAge = lastStatusAt ? now - lastStatusAt : Number.POSITIVE_INFINITY;
  const health =
    statusAge < 5000
      ? { color: C.green, label: `Stage live · ${status?.fps ?? 0}fps`, pulse: true }
      : statusAge < 30000
        ? { color: C.amber, label: "Stage quiet", pulse: false }
        : { color: C.crimson, label: "No stage detected — open the OBS stage or the preview", pulse: false };
  const stageSeen = statusAge < 30000;

  const feed = status ? FEED_PILL[status.feed] : FEED_PILL.idle;
  const feedLabel = status?.feed === "live" && status.room ? `Live @${status.room}` : feed.label;
  const feedLive = status?.feed === "live";
  const feedBusy = status?.feed === "connecting";

  const phaseElapsed = status ? fmtDur((now - phaseRef.current.since) / 1000) : "0:00";

  const btn = "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[12px] font-medium transition hover:brightness-125 disabled:opacity-40";

  return (
    <div className="flex min-h-[100dvh] w-full flex-col" style={{ background: C.ground, color: C.text }}>
      {/* ── sticky header — back link flush top-left ── */}
      <header
        className="sticky top-0 z-20 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b px-4 py-3 backdrop-blur sm:px-6"
        style={{ borderColor: C.line, background: "rgba(10,12,17,0.88)" }}
      >
        <Link href="/home" aria-label="Home" className="flex items-center gap-1 text-[13px] transition hover:brightness-150" style={{ color: C.muted }}>
          <ArrowLeft size={15} /> clunoid
        </Link>
        <span className="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-[0.24em]">
          <Radio size={14} style={{ color: C.crimson }} /> Showtime
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Pill color={health.color} label={health.label} pulse={health.pulse} />
          <Pill color={feed.color} label={feedLabel} pulse={feedLive} />
          <span className="flex items-center gap-1.5 text-[12px] tabular-nums" style={{ color: C.muted }}>
            <Users size={13} /> {fmtInt(status?.viewers ?? 0)}
          </span>
        </div>
      </header>

      {/* ── main grid ── */}
      <main className="grid w-full flex-1 gap-4 p-4 lg:grid-cols-[420px_minmax(0,1fr)_360px]">
        {/* ════ COL 1 — CONTROL ════ */}
        <div className="flex min-w-0 flex-col gap-4">
          <Card title="Go live" icon={<Radio size={13} style={{ color: C.crimson }} />}>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center overflow-hidden rounded-lg border" style={{ borderColor: C.line, background: C.inset }}>
                <span className="pl-3 text-[14px]" style={{ color: C.faint }}>@</span>
                <input
                  value={room}
                  onChange={(e) => setRoom(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") connect();
                  }}
                  placeholder="your.tiktok"
                  className="w-40 bg-transparent px-2 py-2 text-[14px] outline-none"
                  style={{ color: C.text }}
                />
              </div>
              {feedLive || feedBusy ? (
                <button onClick={disconnect} className={btn} style={{ borderColor: C.line, color: C.text }}>
                  {feedBusy && <Loader2 size={13} className="animate-spin" />} Stop
                </button>
              ) : (
                <button onClick={connect} disabled={!room.trim()} className={btn} style={{ borderColor: C.crimson, background: C.crimson, color: "#fff" }}>
                  <Play size={13} /> Connect
                </button>
              )}
            </div>
            <p className="mt-2 min-h-[16px] text-[12px]" style={{ color: status?.feed === "error" ? C.crimson : C.muted }}>
              {status?.feedMsg || cmdMsg || "Commands travel over the Realtime bus — the stage owns the Euler connection."}
            </p>
            {!stageSeen && (
              <p className="mt-1 text-[11px]" style={{ color: C.amber }}>
                No stage is listening yet — open the OBS stage or keep this preview visible first.
              </p>
            )}
          </Card>

          <Card title="Stage output" icon={<ExternalLink size={13} style={{ color: C.cobalt }} />}>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={copyObs} disabled={!creds} className={btn} style={{ borderColor: C.cobalt, background: C.cobalt, color: "#fff" }}>
                {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy OBS URL"}
              </button>
              <a
                href={creds ? `/showtime/stage${stageHash}` : "#"}
                target="_blank"
                rel="noreferrer"
                aria-disabled={!creds}
                className={`${btn} ${creds ? "" : "pointer-events-none opacity-40"}`}
                style={{ borderColor: C.line, color: C.muted }}
              >
                Open stage <ExternalLink size={12} />
              </a>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed" style={{ color: C.faint }}>
              Add it as a 1080×1920 browser/window source in TikTok LIVE Studio. The key rides in the URL fragment, so it never reaches servers or logs.
            </p>
            {!creds && !credsPending && (
              <p className="mt-2 text-[11px]" style={{ color: C.crimson }}>
                Could not mint stage credentials — make sure you are signed in as admin.
              </p>
            )}
          </Card>

          <Card title="Race monitor" icon={<Activity size={13} style={{ color: C.green }} />}>
            {status ? (
              <>
                <div className="flex items-baseline justify-between">
                  <span className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: C.muted }}>
                    {status.phase || "—"} · race {status.raceNumber}
                  </span>
                  <span className="text-[30px] font-bold leading-none tabular-nums">{phaseElapsed}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Stat k="racers on the grid" v={fmtInt(status.racers)} />
                  <Stat k="leader" v={status.leader || "—"} />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <Stat k="events/min" v={fmtInt(status.events1m)} />
                  <Stat k="uptime" v={fmtDur(status.uptimeS)} />
                  <Stat k="fps" v={String(status.fps)} />
                </div>
              </>
            ) : (
              <p className="text-[12px]" style={{ color: C.faint }}>
                Waiting for the first stage heartbeat — open the OBS stage or watch the preview.
              </p>
            )}
          </Card>
        </div>

        {/* ════ COL 2 — LIVE PREVIEW ════ */}
        <div className="flex min-h-0 min-w-0 flex-col gap-4">
          <section className="flex min-h-[420px] flex-1 flex-col overflow-hidden rounded-xl border lg:min-h-0" style={{ borderColor: C.line, background: C.panel }}>
            <header className="flex items-center gap-2 border-b px-4 py-2.5" style={{ borderColor: C.line }}>
              <Play size={13} style={{ color: C.crimson }} />
              <h2 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: C.faint }}>
                Live preview — mirrors the OBS stage
              </h2>
            </header>
            <div className="flex min-h-0 flex-1 items-center justify-center p-4">
              {creds ? (
                <div
                  className="h-full max-h-full max-w-full overflow-hidden rounded-lg border"
                  style={{ aspectRatio: "9 / 16", borderColor: C.line, background: "#000" }}
                >
                  <iframe
                    src={`/showtime/stage#k=${creds.k}&s=${creds.s}&preview=1`}
                    title="Stage preview"
                    className="h-full w-full"
                    style={{ border: 0 }}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2 text-[12px]" style={{ color: C.faint }}>
                  {credsPending ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Minting stage credentials…
                    </>
                  ) : (
                    "Preview unavailable — stage credentials could not be minted."
                  )}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-xl border" style={{ borderColor: C.line, background: C.panel }}>
            <header className="flex items-center justify-between border-b px-4 py-2.5" style={{ borderColor: C.line }}>
              <h2 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: C.faint }}>Event log</h2>
              <span className="text-[10px] tabular-nums" style={{ color: C.faint }}>{log.length ? `last ${log.length}` : ""}</span>
            </header>
            <div className="max-h-56 overflow-y-auto p-3">
              {log.length === 0 ? (
                <p className="px-1 py-2 text-[12px]" style={{ color: C.faint }}>
                  Nothing on the bus yet — fire a simulator event.
                </p>
              ) : (
                <ul className="space-y-1">
                  {log.map(({ id, ev }) => (
                    <li key={id} className="flex items-baseline gap-2 px-1 text-[12px]">
                      <span className="shrink-0 tabular-nums" style={{ color: C.faint }}>{fmtTime(ev.ts)}</span>
                      <span className="shrink-0 font-medium" style={{ color: ev.type === "gift" ? TIER_COLOR[tierForCoins(ev.value)] : C.text }}>
                        @{ev.user.id}
                      </span>
                      <span className="truncate" style={{ color: C.muted }}>{describeEvent(ev)}</span>
                      {ev.sim && (
                        <span className="ml-auto shrink-0 rounded px-1 py-px text-[9px] font-bold uppercase tracking-wider" style={{ color: C.faint, background: C.inset }}>
                          sim
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        {/* ════ COL 3 — SIMULATOR ════ */}
        <div className="flex min-w-0 flex-col gap-4">
          <Card title="Simulate" icon={<Zap size={13} style={{ color: C.amber }} />}>
            <div className="flex items-center overflow-hidden rounded-lg border" style={{ borderColor: C.line, background: C.inset }}>
              <span className="pl-3 text-[13px]" style={{ color: C.faint }}>@</span>
              <input
                value={sender}
                onChange={(e) => {
                  setSender(e.target.value);
                  senderRef.current = e.target.value;
                }}
                placeholder="sender (blank = rotating fakes)"
                className="w-full bg-transparent px-2 py-1.5 text-[13px] outline-none"
                style={{ color: C.text }}
              />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-1.5">
              {SIM_GIFTS.map((g) => {
                const total = g.unitCoins * g.count;
                const tier = tierForCoins(total);
                return (
                  <button
                    key={g.label}
                    onClick={() => sendGift(g.unitCoins, g.count, g.label)}
                    className="flex items-center justify-between gap-1 rounded-lg border px-2.5 py-1.5 text-left text-[12px] transition hover:brightness-125"
                    style={{ borderColor: TIER_COLOR[tier], color: C.text, background: C.inset }}
                  >
                    <span className="truncate">{g.label}</span>
                    <span className="shrink-0 rounded px-1 py-px text-[10px] font-bold tabular-nums" style={{ color: TIER_COLOR[tier] }}>
                      {fmtInt(total)}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              <button onClick={() => sendChat("lets go team!")} className={btn} style={{ borderColor: C.line, color: C.muted }}>Comment</button>
              <button onClick={() => sendChat("lets race!")} className={btn} style={{ borderColor: C.green, color: C.green }}>Join race</button>
              <button onClick={() => sendChat("GO GO GO")} className={btn} style={{ borderColor: C.amber, color: C.amber }}>Cheer</button>
              <button onClick={() => busRef.current?.publishEvent(likeEvent(simUser(), 50, true))} className={btn} style={{ borderColor: C.line, color: C.muted }}>Like ×50</button>
              <button onClick={() => busRef.current?.publishEvent(socialEvent("follow", simUser(), true))} className={btn} style={{ borderColor: C.line, color: C.muted }}>Follow</button>
              <button onClick={() => busRef.current?.publishEvent(socialEvent("share", simUser(), true))} className={btn} style={{ borderColor: C.line, color: C.muted }}>Share</button>
            </div>

            <div className="mt-3 border-t pt-3" style={{ borderColor: C.line }}>
              <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.faint }}>Scenarios</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button onClick={scenarioFlood} className={btn} style={{ borderColor: C.line, color: C.text }}><Play size={12} /> Gift flood</button>
                <button onClick={scenarioWhale} className={btn} style={{ borderColor: TIER_COLOR[4], color: TIER_COLOR[4] }}><Zap size={12} /> Whale moment</button>
                <button onClick={scenarioRush} className={btn} style={{ borderColor: C.line, color: C.text }}><Play size={12} /> Rush hour</button>
                <button onClick={scenarioQuiet} className={btn} style={{ borderColor: C.line, color: C.muted }}>Quiet room</button>
              </div>
              {simNote && <p className="mt-2 text-[11px] leading-relaxed" style={{ color: C.muted }}>{simNote}</p>}
            </div>
          </Card>

          <Card title="All-time board" icon={<Trophy size={13} style={{ color: TIER_COLOR[4] }} />}>
            {boardPending ? (
              <p className="flex items-center gap-2 text-[12px]" style={{ color: C.faint }}>
                <Loader2 size={13} className="animate-spin" /> Loading the board…
              </p>
            ) : !board || (board.gifters.length === 0 && board.monuments.length === 0) ? (
              <p className="text-[12px]" style={{ color: C.faint }}>
                No tribute recorded yet — the first real war writes the book.
              </p>
            ) : (
              <>
                {board.gifters.length > 0 && (
                  <ul className="space-y-1">
                    {board.gifters.map((g, i) => (
                      <li key={g.id} className="flex items-baseline gap-2 text-[12px]">
                        <span className="w-5 shrink-0 text-right tabular-nums" style={{ color: C.faint }}>{i + 1}</span>
                        <span className="truncate font-medium" style={{ color: C.text }}>@{g.name}</span>
                        <span className="ml-auto shrink-0 tabular-nums" style={{ color: C.muted }} title={`≈ $${usdForCoins(g.total_coins).toFixed(2)}`}>
                          {fmtInt(g.total_coins)}
                        </span>
                        <span className="w-12 shrink-0 text-right text-[10px] tabular-nums" style={{ color: C.faint }}>
                          {g.wars} war{g.wars === 1 ? "" : "s"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {board.monuments.length > 0 && (
                  <div className="mt-3 border-t pt-3" style={{ borderColor: C.line }}>
                    <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.faint }}>Monuments</div>
                    <ul className="mt-1.5 space-y-1">
                      {board.monuments.map((m) => (
                        <li key={m.id} className="flex items-baseline gap-2 text-[12px]">
                          <Trophy size={11} className="shrink-0 self-center" style={{ color: TIER_COLOR[4] }} />
                          <span className="truncate font-medium" style={{ color: C.text }}>@{m.name}</span>
                          <span className="ml-auto shrink-0 tabular-nums" style={{ color: TIER_COLOR[4] }}>{fmtInt(m.coins)}</span>
                          <span className="shrink-0 text-[10px] tabular-nums" style={{ color: C.faint }}>
                            {new Date(m.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}
