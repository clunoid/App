"use client";

import { useEffect, useState } from "react";
import { X, History, Play, Pencil, Film, Download, Trash2, Loader2, BarChart3 } from "lucide-react";
import type { RaceData } from "@/lib/stats/types";
import { listStatBattles, deleteStatBattle, type SavedBattle } from "@/lib/stats/storage";
import { downloadDataDocument } from "@/lib/stats/review";

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

/** Your saved stat battles (Supabase) — re-open, edit, make a video, download the
 *  data sheet, or permanently delete. */
export function StatHistory({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (race: RaceData, id: string, mode: "play" | "edit" | "video") => void;
}) {
  const [items, setItems] = useState<SavedBattle[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    listStatBattles().then((rows) => {
      if (alive) {
        setItems(rows);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [open]);

  if (!open) return null;

  const del = async (id: string) => {
    setBusy(id);
    const ok = await deleteStatBattle(id);
    if (ok) setItems((s) => s.filter((x) => x.id !== id));
    setBusy(null);
  };

  const iconBtn = "grid h-9 w-9 place-items-center rounded-lg text-[#2c2823]/55 transition hover:bg-black/10 hover:text-[#2c2823]";

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto" style={{ background: "rgba(201,198,190,0.97)", backdropFilter: "blur(6px)" }}>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/10 px-5 py-3.5 backdrop-blur-md" style={{ background: "rgba(243,241,234,0.86)" }}>
        <div className="flex items-center gap-2 text-lg font-extrabold" style={{ color: INK }}>
          <History size={20} style={{ color: SEAL }} /> Your Stat Battles
        </div>
        <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full text-[#2c2823]/60 transition hover:bg-black/10 hover:text-[#2c2823]">
          <X size={20} />
        </button>
      </div>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-2.5 p-4 sm:p-6">
        {loading ? (
          <div className="mt-24 flex flex-col items-center gap-3 text-[#2c2823]/60">
            <Loader2 size={26} className="animate-spin" /> <span className="font-semibold">Loading your battles…</span>
          </div>
        ) : items.length === 0 ? (
          <p className="mt-24 text-center font-semibold text-[#2c2823]/55">
            No saved stat battles yet — generate one and it&apos;ll be saved here automatically.
          </p>
        ) : (
          items.map((b) => (
            <div key={b.id} className="group flex items-center gap-3 rounded-2xl border border-black/10 p-3.5 transition hover:border-[#8a2433]/40" style={{ background: "rgba(243,241,234,0.9)" }}>
              <button onClick={() => onSelect(b.data, b.id, "play")} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: "rgba(138,36,51,0.1)" }}>
                  <BarChart3 size={20} style={{ color: SEAL }} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-extrabold" style={{ color: INK }}>{b.data?.title || b.title}</div>
                  <div className="mt-0.5 flex items-center gap-2 truncate text-xs font-semibold text-[#2c2823]/55">
                    {b.data?.subtitle ? <span className="truncate">{b.data.subtitle}</span> : null}
                    <span className="shrink-0">· {relTime(b.created_at)}</span>
                  </div>
                </div>
              </button>
              <div className="flex shrink-0 items-center gap-0.5">
                <button onClick={() => onSelect(b.data, b.id, "play")} aria-label="Open" title="Open & play" className={iconBtn}><Play size={17} /></button>
                <button onClick={() => onSelect(b.data, b.id, "edit")} aria-label="Edit" title="Edit data" className={iconBtn}><Pencil size={17} /></button>
                <button onClick={() => onSelect(b.data, b.id, "video")} aria-label="Create video" title="Create video" className={iconBtn}><Film size={17} /></button>
                <button onClick={() => downloadDataDocument(b.data)} aria-label="Download" title="Download data sheet" className={iconBtn}><Download size={17} /></button>
                <button onClick={() => del(b.id)} disabled={busy === b.id} aria-label="Delete" title="Delete permanently" className="grid h-9 w-9 place-items-center rounded-lg text-[#2c2823]/45 transition hover:bg-[#8a2433]/15 hover:text-[#8a2433]">
                  {busy === b.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
