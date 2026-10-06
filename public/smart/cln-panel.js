/**
 * CLUNOID — the Smart Scan bot's panel, in Clunoid's own bot-runner design
 * (public/smart/cln-panel.js).
 *
 * cln-bot.js trades, scans and opens the popups; this file draws the rest the
 * way Clunoid's bot pages do, from the run cln-bot.js keeps:
 *   - one button: Start on Real / Demo, Stop bot while it runs (cln-bot.js has
 *     the same toggle, kept out of sight; this presses it), and the
 *     "running on demo" line under it;
 *   - Live Performance: session P/L, win rate, trades, current stake, loss
 *     streak, market, target, balance, and the running time;
 *   - Recent Trades: every trade of the run, newest first, sliding in;
 *   - the details of the take-profit, stop-loss and deposit popups.
 * It only reads: nothing here can start, buy or stop anything cln-bot.js did
 * not ask for.
 */

(function (global) {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var T = function (s) { return typeof global.t === "function" ? global.t(s) : s; };
  var B = function () { return global.ClnBot && global.ClnBot.run ? global.ClnBot.run() : null; };
  var D = global.ClnDeriv;
  if (!$("scan") || !$("botGo")) return;

  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  function fixed(v) { return (Number(v) || 0).toFixed(2); }
  function signed(v) { var n = Number(v) || 0; return (n >= 0 ? "+" : "") + n.toFixed(2); }
  function money(v, cur) {
    if (v == null || !isFinite(v)) return "—";
    var n = Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return cur ? n + " " + cur : n;
  }
  function clock(ms) {
    var s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    s = s % 60;
    return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }
  function runTime(r) {
    if (!r || !r.startedAt) return "00:00:00";
    var end = r.active ? Date.now() : (r.ended && r.ended.at ? r.ended.at * 1000 : Date.now());
    return clock(end - r.startedAt * 1000);
  }
  function setText(id, v) { var el = $(id); if (el && el.textContent !== v) el.textContent = v; }

  /* ── the button ────────────────────────────────────────────────────── */

  var go = $("botGo"), btn = $("clnGo"), wasRunning = null;
  btn.addEventListener("click", function () {
    var r = B();
    if (r && r.active && r.stopping) return;
    if (!go.disabled) go.click();
  });
  function paintButton() {
    var r = B(), running = !!(r && r.active), stopping = !!(running && r.stopping), c = D && D.current();
    var mode = c && c.type === "demo" ? "Demo" : "Real";
    btn.classList.toggle("is-stop", running);
    btn.disabled = stopping || (!running && go.disabled);
    setText("clnGoText", stopping ? T("Stopping…") : running ? T("Stop bot") : T("Start on " + mode));
    var acc = running && D ? D.accountOf(r.account) : c;
    $("clnRunning").hidden = !running;
    setText("clnRunningText", T("running on {mode}").replace("{mode}", T(acc && acc.type === "demo" ? "demo" : "real")));
    // The Real / Demo toggle locks while a run goes, and unlocks when it ends.
    if (wasRunning !== running) { wasRunning = running; if (D && D.repaint) D.repaint(); }
  }

  /* ── Live Performance ──────────────────────────────────────────────── */

  function tone(id, kind) {
    var el = $(id);
    if (!el) return;
    el.classList.toggle("is-profit", kind === "profit");
    el.classList.toggle("is-loss", kind === "loss");
  }
  function lastOf(r) {
    var last = null;
    ((r && r.log) || []).forEach(function (x) { if (!last || (x.at || 0) > (last.at || 0)) last = x; });
    return last;
  }
  function marketOf(x) {
    var h = global.ClnBot && global.ClnBot.hub, m = h && h.markets && h.markets[x.market];
    return (m && m.name) || x.market;
  }
  function paintStats() {
    var r = B(), n = r ? r.n : 0, won = r ? r.won : 0;
    setText("csPl", r && n ? signed(r.pl) : "—");
    tone("csPl", r && n ? (r.pl >= 0 ? "profit" : "loss") : "");
    setText("csRate", n ? (won / n * 100).toFixed(1) + "%" : "—");
    setText("csRateSub", n ? won + "/" + n : "");
    setText("csN", String(n));
    var stake = r && r.active ? (r.showStake != null ? r.showStake : r.stake) : null;
    setText("csStake", stake != null ? fixed(stake) : "—");
    setText("csStreak", String(r ? r.streak : 0));
    tone("csStreak", r && r.streak > 0 ? "loss" : "");
    var live = !$("botNow").hidden && $("nowMarket").textContent;
    var last = lastOf(r);
    setText("csMarket", live ? $("nowMarket").textContent : last ? marketOf(last) : "—");
    setText("csTarget", live ? $("nowSide").textContent : last ? last.label : "—");
    var acc = D ? (r && r.active ? D.accountOf(r.account) : D.current()) : null;
    setText("csBal", acc ? money(acc.balance, acc.currency) : "—");
    setText("csTime", runTime(r));
  }

  /* ── Recent Trades ─────────────────────────────────────────────────── */

  var UP = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/></svg>';
  var DOWN = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m22 17-8.5-8.5-5 5L2 7"/><path d="M16 17h6v-6"/></svg>';
  var items = $("historyItems"), shown = [], drawnFor = null;
  function key(x) { return x.id ? String(x.id) : x.at + ":" + x.stake + ":" + x.pl; }
  function rowHtml(x) {
    return '<div class="cs-trade-l"><div class="cs-trade-t">' + (x.won ? UP : DOWN) + " " + esc(x.label) + "</div>" +
      '<div class="cs-trade-m">' + esc(marketOf(x)) + " · $" + fixed(x.stake) + "</div></div>" +
      '<div class="cs-trade-p">' + signed(x.pl) + "</div>";
  }
  function build(x, animate) {
    var el = document.createElement("div");
    el.className = "cs-trade " + (x.won ? "is-win" : "is-loss") + (animate ? " is-new" : "");
    el.innerHTML = rowHtml(x);
    el._row = x; el._won = x.won; el._pl = x.pl; el._name = marketOf(x);
    return el;
  }
  function syncTrades() {
    var r = B();
    // Newest first by the time each trade settled: one booked late (a line that dropped) takes its own place.
    var log = ((r && r.log) || []).slice().sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
    var keys = log.map(key), fresh = keys.length - shown.length;
    var same = fresh >= 0 && drawnFor === r && keys.slice(fresh).join("|") === shown.join("|");
    if (!same) {
      items.textContent = "";
      log.forEach(function (x) { items.appendChild(build(x, false)); });
    } else if (fresh > 0) {
      // One or two new trades slide in; a burst (a reload catching up) just appears.
      for (var i = fresh - 1; i >= 0; i--) items.insertBefore(build(log[i], fresh <= 2), items.firstChild);
    }
    // A trade Deriv booked differently from its exit tick, or a market name now known: put its row right.
    Array.prototype.forEach.call(items.children, function (el) {
      var x = el._row;
      if (!x) return;
      if (x.won !== el._won || x.pl !== el._pl || marketOf(x) !== el._name) {
        el.className = "cs-trade " + (x.won ? "is-win" : "is-loss");
        el.innerHTML = rowHtml(x);
        el._won = x.won; el._pl = x.pl; el._name = marketOf(x);
      }
    });
    shown = keys; drawnFor = r;
    setText("csCount", log.length ? String(log.length) : "");
  }

  /* ── the popups' details ───────────────────────────────────────────── */

  function fillResult() {
    var r = B();
    if (!r) return;
    var n = r.n, rate = n ? Math.round(r.won / n * 100) + "%" : "0%";
    ["Win", "Loss"].forEach(function (k) {
      if (!$("bm" + k + "Pl")) return;
      $("bm" + k + "Pl").innerHTML = signed(r.pl) + ' <span>' + esc(r.currency || "USD") + "</span>";
      setText("bm" + k + "N", String(n));
      setText("bm" + k + "Rate", rate);
      setText("bm" + k + "Time", runTime(r));
    });
  }
  /** The deposit popup in Clunoid's words: before a run, "Add funds to start"; a run the
   *  balance could not carry on, "Add funds to keep trading". */
  function fillFund() {
    if ($("bmFund").hidden) return;
    var r = B(), midRun = !!(r && r.ended && r.ended.reason === "balance" && Date.now() / 1000 - r.ended.at < 30);
    setText("bmFundTitle", midRun ? T("Add funds to keep trading") : T("Add funds to start"));
    var c = D && D.current(), real = !(c && c.type === "demo"), link = $("bmFundGo");
    var label = real ? T("Deposit funds") : T("Go to Deriv");
    // cln-bot.js writes its own words into the link each time it opens; these replace them.
    if (link.textContent.trim() !== label || !link.querySelector("svg")) {
      link.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17V3"/><path d="m6 11 6 6 6-6"/><path d="M19 21H5"/></svg> <span>' + esc(label) + "</span>";
    }
  }

  /* ── keeping up ────────────────────────────────────────────────────── */

  /* Changes come in bursts (a trade moves five counters at once): paint once for the
     lot. A timer, not an animation frame — frames stop while the tab is out of sight. */
  var queued = false;
  function paint() {
    if (queued) return;
    queued = true;
    setTimeout(function () {
      queued = false;
      try { paintButton(); } catch (e) {}
      try { paintStats(); } catch (e) {}
      try { syncTrades(); } catch (e) {}
      try { fillFund(); } catch (e) {}
    }, 16);
  }
  if (global.MutationObserver) {
    var mo = new MutationObserver(paint);
    [go, $("botGoText"), $("botN"), $("botPl"), $("botNext"), $("botStreak"), $("botStateText"), $("botLog"), $("botNow"), $("nowMarket"), $("nowSide"), $("acctAmt"), $("bmFund")].forEach(function (el) {
      if (el) mo.observe(el, { attributes: true, childList: true, characterData: true, subtree: true });
    });
    var res = new MutationObserver(fillResult);
    ["bmWinAmt", "bmLossAmt"].forEach(function (id) { if ($(id)) res.observe($(id), { childList: true, characterData: true, subtree: true }); });
  }
  global.addEventListener("cln:account", paint);
  global.addEventListener("cln:runend", paint);
  global.addEventListener("langchange", function () { drawnFor = null; paint(); });
  // The running time ticks.
  setInterval(function () { var r = B(); if (r && r.active) paint(); }, 1000);

  paint();
})(window);
