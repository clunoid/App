"use client";

/**
 * Two small pieces of the MT5 install steps, shared by the bot's page and the
 * SEO download page.
 *
 * CopyAddress: the WebRequest address is the one string in the steps that
 * has to be typed exactly, so it carries a button. It says "Copied" for a
 * moment, then goes back. The clipboard API needs a secure context; the old
 * selection trick covers a browser without it.
 *
 * AlgoToggle: Algo Trading drawn the way MT5's own toolbar draws it — a green
 * play when it is on, a red stop when it is off — because "enable it" is the
 * step people think they have done.
 */

import { useState } from "react";
import { Copy, Check } from "lucide-react";

const GREEN = "#34d399";
const RED = "#f2607d";

export function CopyAddress({ text, muted, accent, line }: { text: string; muted: string; accent: string; line: string }) {
  const [copied, setCopied] = useState(false);
  const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1600); };
  const copy = () => {
    const fallback = () => {
      const ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch { /* nothing more to try */ }
      ta.remove();
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label="Copy the address"
      className="ml-1 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 align-middle text-[11.5px] font-bold transition"
      style={copied
        ? { borderColor: GREEN, background: GREEN, color: "#04202e" }
        : { borderColor: line, color: muted }}
      onMouseEnter={(e) => { if (!copied) { e.currentTarget.style.color = accent; e.currentTarget.style.borderColor = accent; } }}
      onMouseLeave={(e) => { if (!copied) { e.currentTarget.style.color = muted; e.currentTarget.style.borderColor = line; } }}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      <span>{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}

export function AlgoToggle({ on, text, panel }: { on: boolean; text: string; panel: string }) {
  const tone = on ? GREEN : RED;
  return (
    <span
      className="mx-0.5 inline-flex items-center gap-1.5 whitespace-nowrap rounded border py-0.5 pl-1.5 pr-2 align-middle text-[12px] font-semibold"
      style={{ borderColor: tone, background: panel, color: text }}
    >
      <i
        aria-hidden="true"
        style={on
          ? { width: 10, height: 10, background: tone, clipPath: "polygon(0 0, 100% 50%, 0 100%)" }
          : { width: 10, height: 10, background: tone, borderRadius: 2 }}
      />
      Algo Trading
    </span>
  );
}
