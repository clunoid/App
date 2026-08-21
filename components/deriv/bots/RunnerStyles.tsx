"use client";

/**
 * Shared chrome for the bot runner pages — the live one and the simulation.
 *
 * Both pages present the same three-card dashboard, so the rules that make it
 * behave live here rather than in either page: the Recent Trades entry
 * animation, and the height lock that keeps a long trade list scrolling inside
 * its card instead of stretching the page. Kept in one place so the two pages
 * cannot drift apart.
 */
export function RunnerStyles() {
  return (
    <style>{`
      /* A settled trade is prepended, so the new row slides in from the left,
         overshoots, and settles, while a bright colour-matched ring + glow blooms
         and fades — the newest trade is unmistakable without pulling focus off
         the numbers. The list pins overflow-x to hidden: it is overflow-y-auto,
         which would otherwise compute overflow-x to auto and flash a scrollbar as
         the row overshoots past its resting position. */
      @keyframes clnTradeIn {
        0%   { opacity: 0; transform: translate3d(-28px,0,0); }
        55%  { opacity: 1; transform: translate3d(4px,0,0); }
        78%  { transform: translate3d(-2px,0,0); }
        100% { opacity: 1; transform: translate3d(0,0,0); }
      }
      @keyframes clnTradeGlow {
        0%   { box-shadow: 0 0 0 0 rgba(0,0,0,0), 0 0 0 0 rgba(0,0,0,0); }
        25%  { box-shadow: 0 0 0 1.5px var(--cln-ring), 0 4px 26px 3px var(--cln-glow); }
        100% { box-shadow: 0 0 0 0 rgba(0,0,0,0), 0 0 0 0 rgba(0,0,0,0); }
      }
      .cln-trade-row {
        animation: clnTradeIn 460ms cubic-bezier(0.22,0.8,0.3,1) both,
                   clnTradeGlow 1000ms ease-out both;
      }
      @media (prefers-reduced-motion: reduce) {
        .cln-trade-row { animation: none; }
      }
      /* Give the card row a definite height on large, tall screens: min-height
         alone lets a long Recent Trades list grow the card, the grid and the
         page. With a real height (and min-height:0 down the chain) the list
         scrolls inside its card and every card fits the space exactly.
         Guarded on height so short landscape screens keep normal page flow.
         Element-qualified so these beat the lg: utilities they replace. */
      @media (min-width: 1024px) and (min-height: 640px) {
        main.cln-dash { height: 100dvh; }
        div.cln-dash-inner { min-height: 0; }
        div.cln-dash-grid { min-height: 0; grid-auto-rows: minmax(0, 1fr); }
      }
      /* Short landscape screens keep normal page flow (locking to 100dvh there
         would squeeze the Configuration card), so cap the list itself instead —
         otherwise a long list stretches the card the same way. Below lg the
         max-h-[420px] utility already does this. */
      @media (min-width: 1024px) and (max-height: 639px) {
        div.cln-trade-scroll { max-height: 55dvh; }
      }
    `}</style>
  );
}
