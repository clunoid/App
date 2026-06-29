"use client";

import { useEffect, useState } from "react";
import { X, History, RotateCcw, Film, Trash2, Loader2, Globe } from "lucide-react";
import { listGameResults, deleteGameResult, type SavedGame, type GameSnapshot } from "@/lib/games/storage";
import { listSavedVideoIds, deleteGameVideo } from "@/lib/games/videoStore";

const INK = "#2c2823";
const SEAL = "#8a2433";

function relTime(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Your saved games (Supabase) — re-play the same flags, make the recap video you
 *  forgot, or permanently delete. */
export function GameHistory({
  open,
  onClose,
  onReplay,
  onVideo,
}: {
  open: boolean;
  onClose: () => void;
  onReplay: (snap: GameSnapshot) => void;
  onVideo: (snap: GameSnapshot, id: string) => void;
}) {
  const [items, setItems] = useState<SavedGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [savedVideos, setSavedVideos] = useState<Set<string>>(new Set()); // game ids with a cached premium video

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    listGameResults().then((rows) => {
      if (alive) {
        setItems(rows);
        setLoading(false);
      }
    });
    listSavedVideoIds().then((ids) => {
      if (alive) setSavedVideos(new Set(ids));
    });
    return () => {
      alive = false;
    };
  }, [open]);

  if (!open) return null;

  const del = async (id: string) => {
    setBusy(id);
    const ok = await deleteGameResult(id);
    if (ok) {
      setItems((s) => s.filter((x) => x.id !== id));
      void deleteGameVideo(id); // drop its cached video too
      setSavedVideos((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
    setBusy(null);
  };

  const iconBtn = "grid h-9 w-9 place-items-center rounded-lg text-[#2c2823]/55 transition hover:bg-black/10 hover:text-[#2c2823]";

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto" style={{ background: "rgba(201,198,190,0.97)", backdropFilter: "blur(6px)" }}>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/10 px-5 py-3.5 backdrop-blur-md" style={{ background: "rgba(243,241,234,0.86)" }}>
        <div className="flex items-center gap-2 text-lg font-extrabold" style={{ color: INK }}>
          <History size={20} style={{ color: SEAL }} /> Your Games
        </div>
        <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full text-[#2c2823]/60 transition hover:bg-black/10 hover:text-[#2c2823]">
          <X size={20} />
        </button>
      </div>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-2.5 p-4 sm:p-6">
        {loading ? (
          <div className="mt-24 flex flex-col items-center gap-3 text-[#2c2823]/60">
            <Loader2 size={26} className="animate-spin" /> <span className="font-semibold">Loading your games…</span>
          </div>
        ) : items.length === 0 ? (
          <p className="mt-24 text-center font-semibold text-[#2c2823]/55">
            No saved games yet — finish a round of Guess the Country and it&apos;ll be saved here automatically.
          </p>
        ) : (
          items.map((g) => {
            const d = g.data;
            const pct = d.total ? Math.round((d.score / d.total) * 100) : 0;
            return (
              <div key={g.id} className="group flex items-center gap-3 rounded-2xl border border-black/10 p-3.5 transition hover:border-[#8a2433]/40" style={{ background: "rgba(243,241,234,0.9)" }}>
                <button onClick={() => onReplay(d)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: "rgba(138,36,51,0.1)" }}>
                    <Globe size={20} style={{ color: SEAL }} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-extrabold" style={{ color: INK }}>{d.title || g.title}</div>
                    <div className="mt-0.5 flex items-center gap-2 truncate text-xs font-semibold text-[#2c2823]/55">
                      <span className="shrink-0 font-extrabold" style={{ color: SEAL }}>{d.score}/{d.total}</span>
                      <span className="shrink-0">({pct}%)</span>
                      {d.subtitle ? <span className="truncate">· {d.subtitle}</span> : null}
                      <span className="shrink-0">· {relTime(g.created_at)}</span>
                      {savedVideos.has(g.id) ? (
                        <span className="shrink-0 font-bold" style={{ color: SEAL }}>· video saved</span>
                      ) : null}
                    </div>
                  </div>
                </button>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button onClick={() => onReplay(d)} aria-label="Play again" title="Play these flags again" className={iconBtn}><RotateCcw size={17} /></button>
                  {savedVideos.has(g.id) ? (
                    <button onClick={() => onVideo(d, g.id)} aria-label="View saved video" title="View your saved video — no re-render" className="grid h-9 w-9 place-items-center rounded-lg text-[#8a2433] transition hover:bg-[#8a2433]/15">
                      <Film size={17} fill="currentColor" />
                    </button>
                  ) : (
                    <button onClick={() => onVideo(d, g.id)} aria-label="Create video" title="Create the recap video" className={iconBtn}><Film size={17} /></button>
                  )}
                  <button onClick={() => del(g.id)} disabled={busy === g.id} aria-label="Delete" title="Delete permanently" className="grid h-9 w-9 place-items-center rounded-lg text-[#2c2823]/45 transition hover:bg-[#8a2433]/15 hover:text-[#8a2433]">
                    {busy === g.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
