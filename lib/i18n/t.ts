"use client";

import { useEffect, useState } from "react";

/**
 * THE LANGUAGE LAYER'S HOOKS FOR COMPONENTS.
 *
 * The site is translated in the browser by public/i18n/i18n.js: it reads the
 * rendered English and swaps it for the reader's language, so components
 * keep their English JSX and nothing here changes what the server renders.
 * Two things that layer cannot do on its own are handled here:
 *
 * - A sentence built with a number or a name in it ("Day 3 of 28") never
 *   matches a dictionary entry whole. `t()` takes the English template and the
 *   values, and returns the sentence in the current language.
 *
 * - A component that used `t()` rendered before the language arrived, or
 *   before the reader switched. `useLang()` subscribes to the layer's
 *   `langchange` event, so such a component renders again with the new one.
 *
 * On the server, and in the browser before the layer has loaded, `t()` is the
 * identity: English in, English out — which is also what the server rendered,
 * so hydration sees the same text on both sides.
 */
type Vars = Record<string, string | number>;
type WithT = Window & { t?: (s: string) => string; i18n?: { lang: string } };

export function t(template: string, vars?: Vars): string {
  const w = typeof window !== "undefined" ? (window as WithT) : null;
  let out = w && typeof w.t === "function" ? w.t(template) : template;
  if (vars) for (const k of Object.keys(vars)) out = out.split("{" + k + "}").join(String(vars[k]));
  return out;
}

/** The current language code ("en" until the layer says otherwise); renders again when it changes. */
export function useLang(): string {
  const [lang, setLang] = useState("en");
  useEffect(() => {
    const w = window as WithT;
    if (w.i18n && w.i18n.lang) setLang(w.i18n.lang);
    const on = (e: Event) => setLang((e as CustomEvent<{ lang: string }>).detail?.lang || (w.i18n && w.i18n.lang) || "en");
    window.addEventListener("langchange", on);
    return () => window.removeEventListener("langchange", on);
  }, []);
  return lang;
}
