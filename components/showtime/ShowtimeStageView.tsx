"use client";

/**
 * The SHOWTIME STAGE — the fully-automated performer. This page runs inside TikTok
 * LIVE Studio (browser/window capture at 1080×1920) and needs ZERO operator input:
 * it owns the Euler Stream socket (signed stage creds from the URL fragment), runs
 * the deterministic Clash simulation, renders at 60fps, speaks through Isaac + Cluno,
 * snapshots to Supabase every 5s, and resumes the war in ~2s after any reload —
 * auto-reconnecting to the last room. The console only monitors and simulates.
 *
 * Modes: LIVE (default — socket + persistence + audio) vs PREVIEW (#preview=1, used
 * by the console iframe: render-only mirror fed by the Realtime bus, no socket, no
 * persistence, no audio) so two open stages never double-write or double-connect.
 */
import { useEffect, useRef, useState } from "react";
import { createBus, type ShowtimeBus } from "@/lib/showtime/bus";
import { chatEvent, giftEvent, likeEvent, makeUser, socialEvent } from "@/lib/showtime/gifts";
import { fragmentCreds, stageApi, type StageCreds } from "@/lib/showtime/stagecreds";
import { createEulerFeed, type EulerStatus } from "@/lib/showtime/euler";
import { ClashSim } from "@/lib/showtime/games/clash/sim";
import { ClashRenderer } from "@/lib/showtime/games/clash/render";
import { HOST_LINES } from "@/lib/showtime/games/clash/strings";
import { StageAudio } from "@/lib/showtime/audio";
import { HostVoice, fillTemplate, type Speaker } from "@/lib/showtime/voice";
import type { GameSnapshot, GifterRow, MonumentRow, ShowEvent, SimEvent } from "@/lib/showtime/types";

const SIM_STEP_MS = 1000 / 30; // fixed-timestep simulation, decoupled from render fps
const SAVE_EVERY_MS = 5_000;
const STATUS_EVERY_MS = 1_000;
const TOP_REFRESH_MS = 10 * 60_000;

export function ShowtimeStageView() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [noKey, setNoKey] = useState(false);

  useEffect(() => {
    const frag = fragmentCreds();
    if (!frag) {
      setNoKey(true);
      return;
    }
    const creds: StageCreds = { k: frag.k, s: frag.s };
    const live = !frag.preview;
    const canvas = canvasRef.current!;

    /* ── core pieces ── */
    const sim = new ClashSim(7);
    const renderer = new ClashRenderer(canvas);
    const bus: ShowtimeBus = createBus(frag.k);
    const audio = new StageAudio(frag.muted || !live);
    const voice = live && !frag.muted ? new HostVoice(creds, { onSpeaking: (on) => audio.duck(on) }) : null;

    let room = "";
    let feedStatus: EulerStatus = "idle";
    let disposed = false;
    let humanIds = new Set<string>(); // users seen via REAL (non-sim) events — the only ones persisted
    const pending: ShowEvent[] = [];

    /* ── voice lines from discrete sim moments ── */
    let flip = 0;
    const speaker = (): Speaker => (flip++ % 2 === 0 ? "isaac" : "cluno");
    const pick = (arr: string[], n: number) => arr[n % arr.length];
    let lineN = 0;
    const speakFor = (e: SimEvent) => {
      if (!voice) return;
      lineN++;
      switch (e.kind) {
        case "takeover":
          voice.say(0, speaker(), fillTemplate(pick(HOST_LINES.takeover, lineN), { name: e.user.name, team: e.team }));
          break;
        case "campaignEnd":
          voice.say(0, speaker(), fillTemplate(pick(HOST_LINES.campaignEnd, lineN), { team: e.winner, name: e.mvp?.user.name }));
          break;
        case "warEnd":
          voice.say(1, speaker(), e.winner ? fillTemplate(pick(HOST_LINES.warEndWin, lineN), { team: e.winner, name: e.mvp?.user.name }) : pick(HOST_LINES.warDraw, lineN));
          break;
        case "suddenDeath":
          voice.say(1, speaker(), pick(HOST_LINES.suddenDeath, lineN));
          break;
        case "strike":
          if (e.tier >= 2) voice.say(2, speaker(), fillTemplate(pick(HOST_LINES.strikeBig, lineN), { name: e.user.name, team: e.team }));
          break;
        case "firstHuman":
          voice.say(2, speaker(), fillTemplate(pick(HOST_LINES.firstHuman, lineN), { name: e.user.name }));
          break;
        case "welcome":
          voice.say(3, speaker(), fillTemplate(pick(HOST_LINES.welcome, lineN), { name: e.user.name, team: e.team }));
          break;
        case "comeback":
          voice.say(3, speaker(), fillTemplate(pick(HOST_LINES.comeback, lineN), { team: e.team }));
          break;
        case "warStart":
          if (e.warNumber % 2 === 1) voice.say(3, speaker(), pick(HOST_LINES.warStart, lineN));
          break;
      }
    };

    /* ── SFX from discrete sim moments ── */
    let lastSpawnSfx = 0;
    const sfxFor = (e: SimEvent, now: number) => {
      switch (e.kind) {
        case "spawn":
          if (now - lastSpawnSfx > 220) {
            audio.spawn();
            lastSpawnSfx = now;
          }
          break;
        case "strike":
          audio.strike(e.tier);
          break;
        case "surge":
          audio.surge();
          break;
        case "warStart":
          audio.horn();
          break;
        case "suddenDeath":
          audio.suddenDeath();
          break;
        case "coreBreak":
          audio.coreBreak();
          break;
        case "warEnd":
        case "campaignEnd":
          audio.fanfare();
          break;
      }
    };

    /* ── persistence (live stage only, real users only) ── */
    const persistFor = (e: SimEvent) => {
      if (!live) return;
      if (e.kind === "warEnd" || e.kind === "campaignEnd") {
        const rows = sim.state.warMvps
          .filter((r) => humanIds.has(r.user.id))
          .map((r, i) => ({ id: r.user.id, name: r.user.name, avatarUrl: r.user.avatarUrl, rank: i + 1 }));
        if (rows.length) void stageApi("/api/showtime/persist", creds, { op: "war", rows });
      }
    };

    const handleSimEvents = (evs: SimEvent[], now: number) => {
      if (!evs.length) return;
      renderer.onSimEvents(evs);
      for (const e of evs) {
        sfxFor(e, now);
        speakFor(e);
        persistFor(e);
      }
    };

    /* ── event intake: euler feed (live) + bus (simulator / cross-surface) ── */
    const intake = (ev: ShowEvent) => {
      pending.push(ev);
      if (live && !ev.sim && ev.user?.id && ev.type !== "room") humanIds.add(ev.user.id);
      if (live && !ev.sim && ev.type === "gift" && ev.value > 0) {
        void stageApi("/api/showtime/persist", creds, { op: "gift", user: ev.user, coins: ev.value });
      }
    };

    const offEv = bus.onEvent(intake);

    // Rehearsal hook (browser console): __showtimeInject("gift", 29999) / ("combo", 50) /
    // ("chat","red") / ("like",50) / ("follow") — ALWAYS sim:true, never persisted.
    const inject = (kind: string, a?: number | string, name?: string) => {
      const u = makeUser(String(name || "rehearsal" + ((Math.random() * 90) | 0)));
      if (kind === "gift") intake({ ...giftEvent(u, Number(a) || 1, 1), sim: true });
      else if (kind === "combo") intake({ ...giftEvent(u, 1, Number(a) || 10), sim: true });
      else if (kind === "chat") intake(chatEvent(u, String(a ?? "hello"), true));
      else if (kind === "like") intake(likeEvent(u, Number(a) || 10, true));
      else if (kind === "follow" || kind === "share" || kind === "join") intake(socialEvent(kind, u, true));
    };
    (window as unknown as Record<string, unknown>).__showtimeInject = inject;
    (window as unknown as Record<string, unknown>).__showtimeProbe = () => ({
      fps,
      units: sim.state.units.length,
      phase: sim.state.phase,
      p: sim.state.p,
      idle: sim.state.idle,
      ticker: sim.state.ticker.length,
      simClock: sim.state.simClock,
    });

    const feed = live
      ? createEulerFeed(
          intake,
          (status, msg) => {
            feedStatus = status;
            renderer.setConnection(status, room);
            statusMsg = msg;
          },
          () => creds,
        )
      : null;

    let statusMsg: string | undefined;

    /* ── console commands ── */
    const offCmd = bus.onCommand((c) => {
      if (!live) return; // preview mirrors, never acts
      if (c.cmd === "connect" && c.room) {
        room = c.room.replace(/^@/, "").trim().toLowerCase();
        sim.setRoom(room);
        feed?.start(room);
        void stageApi("/api/showtime/persist", creds, { op: "save", state: sim.snapshot(), room });
      } else if (c.cmd === "disconnect") {
        room = "";
        sim.setRoom("");
        feed?.stop();
        void stageApi("/api/showtime/persist", creds, { op: "save", state: sim.snapshot(), room: "" });
      } else if (c.cmd === "theme" && c.theme) {
        renderer.setTheme(c.theme);
      } else if (c.cmd === "reload") {
        window.location.reload();
      }
    });

    /* ── boot: restore snapshot, auto-reconnect, hall of fame ── */
    if (live) {
      void (async () => {
        const r = await stageApi<{ snapshot: GameSnapshot | null; room: string }>("/api/showtime/persist", creds, { op: "restore" });
        if (disposed) return;
        if (r?.snapshot) sim.restore(r.snapshot);
        if (r?.room) {
          room = r.room;
          sim.setRoom(room);
          feed?.start(room); // the automation chain: reload → restore → reconnect → resume
        }
      })();
    }
    const loadTop = async () => {
      const r = await stageApi<{ gifters: GifterRow[]; monuments: MonumentRow[] }>("/api/showtime/persist", creds, { op: "top" });
      if (!disposed && r) renderer.setAllTime(r.gifters || [], r.monuments || []);
    };
    void loadTop();
    const topTimer = window.setInterval(() => void loadTop(), TOP_REFRESH_MS);

    /* ── voice warm-up: pre-render the template-free stock lines ── */
    if (voice) {
      const warm: { speaker: Speaker; text: string }[] = [];
      for (const t of [...HOST_LINES.warStart, ...HOST_LINES.warDraw, ...HOST_LINES.suddenDeath, ...HOST_LINES.ambient]) {
        if (!t.includes("{")) warm.push({ speaker: warm.length % 2 === 0 ? "isaac" : "cluno", text: t });
      }
      voice.warm(warm.slice(0, 16));
    }

    /* ── ambient host banter (kept sparse; cached lines are free after first synth) ── */
    const ambientTimer = window.setInterval(() => {
      if (voice && sim.state.idle) voice.say(4, speaker(), pick(HOST_LINES.ambient, ++lineN));
    }, 180_000);

    /* ── the engine loop: fixed-step sim, 60fps render ──
     * rAF drives it when the tab is visible; a timer PUMP takes over whenever rAF
     * is starved (hidden/backgrounded capture browsers throttle rAF to zero — the
     * war must keep running and stay capturable regardless). */
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let frames = 0;
    let fps = 60;
    let fpsWindow = performance.now();
    let evCount = 0;
    let evWindow = performance.now();
    const bootAt = performance.now();

    const advance = (now: number) => {
      if (disposed) return;
      acc += Math.min(2000, now - last);
      last = now;

      // ingest queued events at step boundaries (deterministic ordering)
      while (pending.length) {
        const ev = pending.shift()!;
        evCount++;
        handleSimEvents(sim.onEvent(ev), now);
      }
      while (acc >= SIM_STEP_MS) {
        handleSimEvents(sim.tick(SIM_STEP_MS), now);
        acc -= SIM_STEP_MS;
      }
      renderer.render(sim.state, now);

      frames++;
      if (now - fpsWindow >= 1000) {
        fps = Math.round((frames * 1000) / Math.max(1, now - fpsWindow));
        frames = 0;
        fpsWindow = now;
      }
      if (now - evWindow >= 60_000) {
        evCount = 0;
        evWindow = now;
      }
    };

    const loop = (now: number) => {
      if (disposed) return;
      advance(now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // Pump: if rAF hasn't fired for 200ms (hidden tab / throttled capture browser),
    // keep the simulation + canvas advancing from a timer instead.
    const pump = window.setInterval(() => {
      const now = performance.now();
      if (now - last > 200) advance(now);
    }, 100);

    /* ── heartbeat + snapshot timers (live only) ── */
    const statusTimer = live
      ? window.setInterval(() => {
          const st = sim.state;
          bus.publishStatus({
            ts: Date.now(),
            feed: feedStatus,
            feedMsg: statusMsg,
            room,
            phase: st.phase,
            warNumber: st.warNumber,
            wins: { crimson: st.wins.crimson, cobalt: st.wins.cobalt },
            p: st.p,
            viewers: st.viewers,
            fps,
            events1m: evCount,
            uptimeS: Math.round((performance.now() - bootAt) / 1000),
          });
        }, STATUS_EVERY_MS)
      : 0;

    const saveTimer = live
      ? window.setInterval(() => {
          void stageApi("/api/showtime/persist", creds, { op: "save", state: sim.snapshot(), room });
        }, SAVE_EVERY_MS)
      : 0;

    /* ── audio unlock + resize ── */
    const arm = () => audio.arm();
    arm();
    window.addEventListener("pointerdown", arm);
    const onResize = () => renderer.resize();
    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.clearInterval(pump);
      offEv();
      offCmd();
      feed?.stop();
      bus.close();
      renderer.dispose();
      audio.dispose();
      voice?.dispose();
      if (statusTimer) window.clearInterval(statusTimer);
      if (saveTimer) window.clearInterval(saveTimer);
      window.clearInterval(topTimer);
      window.clearInterval(ambientTimer);
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("resize", onResize);
      humanIds = new Set();
    };
  }, []);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-black">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {noKey && (
        <div className="absolute inset-0 grid place-items-center px-8 text-center">
          <p className="max-w-sm text-[13px] text-white/50">
            This stage needs its link from the Showtime console. Open <b className="text-white/80">Showtime → Copy OBS URL</b> and use that as your browser/window source.
          </p>
        </div>
      )}
    </div>
  );
}
