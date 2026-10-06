"use client";

/**
 * SMART SCAN — the Smart Scan bot on /trading/command, in Clunoid's own
 * bot-runner design: Configuration, Live Performance and Recent Trades side by
 * side, the balance pill with its Real / Demo toggle, Clunoid's take-profit,
 * stop-loss and deposit popups. Adds what the Smart Scan system brings: the four
 * trade types, the prediction, a live scan of every market before each trade,
 * Martingale and Dynamic Martingale with recovery, a run that survives a reload,
 * and a connection that keeps itself up.
 *
 * The engine is plain browser script, the same tested one as every Smart Scan
 * bot (public/smart: cln-deriv.js the connection, cln-bot.js the bot,
 * cln-panel.js this design's painting). React renders the markup once and never
 * touches it again; the scripts own it from then on.
 *
 * ONE APP: everything here runs on the visitor's own Deriv sign-in — a token
 * issued to Clunoid's app, 33PP… — and sends `Deriv-App-ID: 33PP…`, so every
 * trade is the app's.
 */
import { memo, useEffect, useRef } from "react";
import { DERIV_CLIENT_ID, DERIV_TRACKED_DEPOSIT_URL, DERIV_TRACKED_PORTFOLIO_URL } from "@/lib/deriv/config";
import { reconnectAfterExpiry } from "@/lib/deriv/oauth";

/** Bump with any change under public/smart, so a returning browser takes the new files. */
const V = "20261007b";
const SCRIPTS = ["/smart/cln-deriv.js", "/smart/cln-bot.js", "/smart/cln-panel.js"];

const ic = (path: string, size = 16, extra = "") =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${path}</svg>`;
const I = {
  bot: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3" fill="currentColor"/>',
  square: '<rect width="16" height="16" x="4" y="4" rx="2" fill="currentColor"/>',
  spin: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
  trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
};
const CONFETTI = "<i></i>".repeat(18);

const MARKUP = `
<div class="cs-head">
  <div class="cs-id">
    <span class="cs-ico">${ic(I.bot, 18)}</span>
    <div class="cs-id-t">
      <div class="cs-name" id="botTitle">Smart Scan bot</div>
      <div class="cs-lede" id="botLede">Finds the best market and digit for your contract, Differs or Matches, then trades it one 1-tick contract at a time until your take profit or stop loss.</div>
    </div>
  </div>
  <div class="cs-acct" id="acct" hidden>
    <span class="cs-bal">${ic(I.wallet, 13)}<span class="cs-live" aria-hidden="true"></span><span class="cs-mono" id="acctAmt" data-i18n-skip>—</span></span>
    <div class="cs-modes" id="acctModes" role="group" aria-label="Account"></div>
  </div>
</div>

<section class="cs-state" id="tState" aria-live="polite" hidden>
  <div class="cs-busy" id="tBusy" hidden><span class="cs-spin">${ic(I.spin, 18)}</span><span id="tBusyText">Connecting to Deriv…</span></div>
  <div class="cs-note-box" id="tNote" hidden><p id="tNoteText"></p></div>
</section>

<div class="cs-grid" id="scan" hidden>
  <section class="cs-col">
    <div class="cs-col-h"><h2>Configuration</h2></div>
    <div class="cs-types" id="botTypes" role="tablist" aria-label="Trade type">
      <button class="bot-type" type="button" role="tab" data-type="evenodd">Even / Odd</button>
      <button class="bot-type" type="button" role="tab" data-type="risefall">Rise / Fall</button>
      <button class="bot-type" type="button" role="tab" data-type="overunder">Over / Under</button>
      <button class="bot-type" type="button" role="tab" data-type="matchdiff">Matches / Differs</button>
    </div>
    <div class="cs-fields">
      <label class="cs-field cs-field--wide" id="botVarWrap" hidden><span id="botVarLabel">Prediction</span>
        <span class="cs-select"><select id="botVar"></select>${ic(I.down, 15)}</span></label>
      <label class="cs-field"><span>Initial stake (USD)</span><span class="cs-in"><input id="botStake" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" /></span></label>
      <label class="cs-field"><span>Take profit (USD)</span><span class="cs-in"><input id="botTp" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" /></span></label>
      <label class="cs-field"><span>Stop loss (USD)</span><span class="cs-in"><input id="botSl" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" /></span></label>
      <label class="cs-field"><span>Martingale ×</span><span class="cs-in"><input id="botMult" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" /></span></label>
    </div>
    <div class="cs-note">
      <span class="cs-min" id="botMin" data-i18n-skip>Smallest stake: $0.35</span>
      <label class="cs-keep"><input type="checkbox" id="botKeep" role="switch" /><i aria-hidden="true"></i><span>Save settings</span></label>
    </div>
    <div class="cs-actions">
      <button class="cs-go" id="clnGo" type="button"><span class="cs-go-play">${ic(I.play, 14)}</span><span class="cs-go-stop">${ic(I.square, 13)}</span><span id="clnGoText">Start on Real</span></button>
      <div class="cs-running" id="clnRunning" hidden><span class="cs-spin">${ic(I.spin, 13)}</span><span id="clnRunningText">running on real</span></div>
      <div class="bot-state bot-state--idle" id="botState"><span id="botStateText">Ready</span></div>
      <p class="cs-msg" id="botMsg" role="alert" hidden></p>
      <p class="cs-fine">Stops automatically at your take-profit or stop-loss (realised P/L).</p>
    </div>
  </section>

  <section class="cs-col bot-main">
    <div class="cs-col-h"><h2>Live Performance</h2><span class="cs-right cs-mono" id="csTime" data-i18n-skip>00:00:00</span></div>
    <div class="cs-now" id="botNow" hidden>
      <div class="cs-now-h"><span class="cs-now-k"><i aria-hidden="true"></i>Live scan</span><span class="cs-now-note">Best market right now</span></div>
      <div class="cs-now-b">
        <div class="cs-now-t"><div class="cs-now-m" id="nowMarket" translate="no"></div><div class="bot-now-side" id="nowSide"></div></div>
        <div class="cs-now-p"><b class="cs-mono" id="nowShare" data-i18n-skip></b><span>of the last 10 ticks</span></div>
      </div>
      <div class="bot-dots" id="nowDots" aria-hidden="true"></div>
    </div>
    <div class="cs-stats">
      <div class="cs-stat"><span>Session P/L</span><b class="cs-mono" id="csPl" data-i18n-skip>—</b></div>
      <div class="cs-stat"><span>Win rate</span><b class="cs-mono cs-purple" data-i18n-skip><span id="csRate">—</span> <small id="csRateSub"></small></b></div>
      <div class="cs-stat"><span>Trades</span><b class="cs-mono cs-orange" id="csN" data-i18n-skip>0</b></div>
      <div class="cs-stat"><span>Current stake</span><b class="cs-mono cs-cyan" id="csStake" data-i18n-skip>—</b></div>
      <div class="cs-stat"><span>Loss streak</span><b class="cs-mono cs-red" id="csStreak" data-i18n-skip>0</b></div>
      <div class="cs-stat"><span>Market</span><b class="cs-mono cs-amber" id="csMarket" translate="no" data-i18n-skip>—</b></div>
      <div class="cs-stat"><span>Target</span><b class="cs-mono cs-amber" id="csTarget" data-i18n-skip>—</b></div>
      <div class="cs-stat"><span>Balance</span><b class="cs-mono cs-cyan" id="csBal" data-i18n-skip>—</b></div>
    </div>
  </section>

  <section class="cs-col cs-trades">
    <div class="cs-col-h"><h2>Recent Trades</h2><span class="cs-right cs-mono" id="csCount" data-i18n-skip></span></div>
    <div class="cs-trades-in">
      <div class="cs-empty" id="botEmpty"><span>No trades yet — start the bot.</span></div>
      <div class="cs-list" id="historyItems" translate="no"></div>
    </div>
  </section>
</div>

<p class="cs-risk">Trading carries risk. This is an automated tool, not financial advice or a profit guarantee. Never risk more than you can afford to lose.</p>

<div class="cs-engine" hidden aria-hidden="true">
  <button id="botGo" type="button" tabindex="-1"><span id="botGoText">Scan &amp; start</span></button>
  <span id="botPl"></span><span id="botN"></span><span id="botWon"></span><span id="botLost"></span><span id="botNext"></span><span id="botStreak"></span><span id="logN"></span>
  <ul id="botLog"></ul>
</div>

<div class="bm-root" id="bmRoot" role="dialog" aria-modal="true" aria-labelledby="bmTitle" hidden>
  <div class="bm-back" data-bm-close></div>
  <div class="bm">
    <button class="bm-x" type="button" data-bm-close aria-label="Close">${ic(I.x, 16)}</button>

    <div class="bm-view" id="bmScan">
      <div class="bm-radar" aria-hidden="true"><i></i><i></i><i></i>${ic(I.search, 26)}</div>
      <h2 id="bmTitle">Scanning Even/Odd markets</h2>
      <p class="bm-step" id="bmStep">Connecting to the markets…</p>
      <div class="bm-bar"><i id="bmBar"></i></div>
      <p class="bm-pct cs-mono" id="bmPct" data-i18n-skip>0%</p>
    </div>

    <div class="bm-view" id="bmDone" hidden>
      <svg class="bm-tick" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24"/><path d="M15 27.5l7 7 15-16"/></svg>
      <h2>Best trade found</h2>
      <div class="bm-pick">
        <span class="bm-pick-m" id="bmMarket" translate="no"></span>
        <b class="bm-pick-side" id="bmSide"></b>
        <span class="bm-pick-s" id="bmShare" data-i18n-skip></span>
        <div class="bot-dots bm-dots" id="bmDots" aria-hidden="true"></div>
      </div>
      <div class="bm-sum">
        <div><span>Stake</span><b class="cs-mono" id="bmStake" data-i18n-skip></b></div>
        <div><span>Martingale</span><b class="cs-mono" id="bmMult" data-i18n-skip></b></div>
        <div><span>Take profit</span><b class="cs-mono" id="bmTp" data-i18n-skip></b></div>
        <div><span>Stop loss</span><b class="cs-mono" id="bmSl" data-i18n-skip></b></div>
      </div>
      <p class="bm-live"><i aria-hidden="true"></i><span>Trading started</span></p>
    </div>

    <div class="bm-view" id="bmErr" hidden>
      <div class="bm-erricon" aria-hidden="true">!</div>
      <h2>The scan did not finish</h2>
      <p class="bm-step" id="bmErrText"></p>
      <div class="bm-actions">
        <button class="bm-btn bm-btn--line" type="button" data-bm-close>Close</button>
        <button class="bm-btn bm-btn--go btn-blue" type="button" id="bmRetry">Try again</button>
      </div>
    </div>

    <div class="bm-view bm-fin bm-fin--win" id="bmWin" hidden>
      <div class="bm-confetti" aria-hidden="true">${CONFETTI}</div>
      <span class="bm-fin-ico">${ic(I.trophy, 30)}</span>
      <div class="bm-fin-k">Take Profit</div>
      <h2>Target reached 🎯</h2>
      <p class="bm-fin-p">Your take-profit target was reached and the bot stopped — profit locked in.</p>
      <div class="bm-fin-pl"><div>Session P/L</div><b class="cs-mono" id="bmWinPl" data-i18n-skip></b></div>
      <div class="bm-fin-mini">
        <div><span>Trades</span><b class="cs-mono" id="bmWinN" data-i18n-skip></b></div>
        <div><span>Win rate</span><b class="cs-mono" id="bmWinRate" data-i18n-skip></b></div>
        <div><span>Time</span><b class="cs-mono" id="bmWinTime" data-i18n-skip></b></div>
      </div>
      <span class="bm-src" id="bmWinAmt" hidden></span><span class="bm-src" id="bmWinSum" hidden></span>
      <button class="bm-fin-done btn-blue" type="button" data-bm-close>Done</button>
    </div>

    <div class="bm-view bm-fin bm-fin--loss" id="bmLoss" hidden>
      <span class="bm-fin-ico">${ic(I.shield, 30)}</span>
      <div class="bm-fin-k">Stop Loss</div>
      <h2>Stop-loss hit</h2>
      <p class="bm-fin-p">Your stop-loss was reached, so the bot stopped to protect your balance.</p>
      <div class="bm-fin-pl"><div>Session P/L</div><b class="cs-mono" id="bmLossPl" data-i18n-skip></b></div>
      <div class="bm-fin-mini">
        <div><span>Trades</span><b class="cs-mono" id="bmLossN" data-i18n-skip></b></div>
        <div><span>Win rate</span><b class="cs-mono" id="bmLossRate" data-i18n-skip></b></div>
        <div><span>Time</span><b class="cs-mono" id="bmLossTime" data-i18n-skip></b></div>
      </div>
      <span class="bm-src" id="bmLossAmt" hidden></span><span class="bm-src" id="bmLossSum" hidden></span>
      <button class="bm-fin-done btn-blue" type="button" data-bm-close>Done</button>
    </div>

    <div class="bm-view bm-fund" id="bmFund" hidden>
      <span class="bm-fund-ico">${ic(I.wallet, 20)}</span>
      <h3 id="bmFundTitle">Add funds to start</h3>
      <p class="bm-fund-p" id="bmFundText" data-i18n-skip></p>
      <p class="bm-fund-p">You can deposit any amount, and we recommend 1,000 USD or more for the best results.</p>
      <p class="bm-fund-note" id="bmFundNote" data-i18n-skip></p>
      <p class="bm-fund-vis">Not seeing your full balance? Only your options trading account shows here — move your other funds into it from your <a href="${DERIV_TRACKED_PORTFOLIO_URL}" target="_blank" rel="noopener noreferrer">Deriv portfolio</a>.</p>
      <a class="bm-fund-go btn-blue" id="bmFundGo" href="${DERIV_TRACKED_DEPOSIT_URL}" target="_blank" rel="noopener noreferrer" data-bm-close>Deposit funds</a>
      <button class="bm-fund-later" type="button" data-bm-close>Later</button>
    </div>
  </div>
</div>
`;

type W = Window & {
  ClnConfig?: { appId: string; depositUrl: string };
  __clnSmartRoot?: Element | null;
};

export const SmartScan = memo(function SmartScan() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const w = window as W;
    const el = root.current;
    /* The scripts run once per page load and bind to this markup. Back on this page
       inside the app (left with the back button, say), the markup is new and the
       old engine's is gone: start clean. */
    if (w.__clnSmartRoot && w.__clnSmartRoot !== el) { window.location.reload(); return; }
    if (!w.__clnSmartRoot) {
      w.__clnSmartRoot = el;
      w.ClnConfig = { appId: DERIV_CLIENT_ID, depositUrl: DERIV_TRACKED_DEPOSIT_URL };
      for (const src of SCRIPTS) {
        const s = document.createElement("script");
        s.src = `${src}?v=${V}`;
        s.async = false;              // in order: the connection, the bot, the panel
        document.body.appendChild(s);
      }
    }
    // Deriv refused the sign-in (cln-deriv.js decides when): Clunoid's own re-sign-in.
    const onExpired = () => { reconnectAfterExpiry(); };
    window.addEventListener("cln:expired", onExpired);
    return () => {
      window.removeEventListener("cln:expired", onExpired);
      /* Left for another page inside the app: the engine cannot follow its markup,
         so the page loads afresh (a run in progress resumes when the visitor is back). */
      setTimeout(() => { if (el && !el.isConnected) window.location.reload(); }, 0);
    };
  }, []);

  return (
    <>
      {/* React 19 hoists this into <head> once. */}
      <link rel="stylesheet" href={`/smart/cln-smart.css?v=${V}`} precedence="default" />
      <div ref={root} id="clnSmart" className="cln-smart" dangerouslySetInnerHTML={{ __html: MARKUP }} />
    </>
  );
});
