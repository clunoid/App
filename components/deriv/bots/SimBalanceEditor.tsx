"use client";

import { useCallback, useEffect, useState } from "react";
import { TC, monoFont } from "@/lib/trading/theme";
import {
  DEFAULT_SIM_BALANCE,
  dismissSimTutorial,
  getSimBalance,
  isSimTutorialDismissed,
  setSimBalance,
} from "@/lib/deriv/bots/simBalance";

type Props = {
  onBalanceChange: (balance: number) => void;
  className?: string;
};

/** Editable sim balance bar — matches BotsLab simtrading-bots balance editor behaviour. */
export function SimBalanceEditor({ onBalanceChange, className }: Props) {
  const [input, setInput] = useState("");
  const [committed, setCommitted] = useState("");
  const [showApply, setShowApply] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  const syncCommitted = useCallback((value: number) => {
    const s = value.toFixed(2);
    setCommitted(s);
    setInput(s);
    setShowApply(false);
    onBalanceChange(value);
  }, [onBalanceChange]);

  useEffect(() => {
    syncCommitted(getSimBalance());
    setShowTutorial(!isSimTutorialDismissed());
  }, [syncCommitted]);

  const apply = () => {
    const n = parseFloat(input);
    if (!Number.isFinite(n) || n < 0) {
      syncCommitted(getSimBalance());
      return;
    }
    const value = setSimBalance(n);
    syncCommitted(value);
    dismissSimTutorial();
    setShowTutorial(false);
  };

  const onInput = (raw: string) => {
    setInput(raw);
    const parsed = parseFloat(raw);
    const dirty = Number.isFinite(parsed) && parsed.toFixed(2) !== committed;
    setShowApply(dirty);
  };

  return (
    <div className={className}>
      {showTutorial && (
        <div role="note" className="relative mb-2 rounded-xl border px-3 py-2 text-[11.5px]" style={{ borderColor: "rgba(56,189,248,0.35)", background: "rgba(56,189,248,0.08)", color: TC.muted }}>
          Edit your balance here, then tap Apply.
          <button type="button" onClick={() => { dismissSimTutorial(); setShowTutorial(false); }}
            className="absolute right-2 top-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold transition hover:bg-white/10" style={{ color: TC.faint }}>
            ×
          </button>
        </div>
      )}
      <div className="inline-flex flex-wrap items-center gap-2 rounded-full border px-3 py-1.5" style={{ borderColor: TC.line, background: TC.panel }}>
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: TC.faint }}>Balance</span>
        <input
          type="number"
          min={0}
          step={0.01}
          inputMode="decimal"
          value={input}
          aria-label="Balance in USD"
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && showApply) apply(); }}
          className="w-[7.5rem] rounded-lg border bg-transparent px-2 py-1 text-[13px] outline-none focus:border-sky-400"
          style={{ ...monoFont, borderColor: TC.line, color: TC.text }}
        />
        <span className="text-[11px] font-semibold" style={{ color: TC.faint }}>USD</span>
        {showApply && (
          <button type="button" onClick={apply}
            className="rounded-lg px-2.5 py-1 text-[11px] font-bold transition hover:opacity-90"
            style={{ background: TC.profit, color: TC.ink }}>
            Apply
          </button>
        )}
      </div>
    </div>
  );
}

export function readSimBalanceOrDefault(): number {
  return typeof window !== "undefined" ? getSimBalance() : DEFAULT_SIM_BALANCE;
}
