/**
 * CLUNOID — the Smart Scan bot's Deriv connection (public/smart/cln-deriv.js).
 *
 * The connection the visitor already made on /trading/command: Deriv's own
 * sign-in, an access token issued to Clunoid's app (33PP…, handed over by the
 * page as ClnConfig.appId) and kept in this browser (clunoid_deriv_access).
 * Every call carries that token and `Deriv-App-ID: 33PP…`, so every trade the
 * bot places is the app's. No other app id is used.
 *
 *   1. The accounts: GET /trading/v1/options/accounts, with their balances.
 *   2. One socket per account (Deriv authorises a socket for exactly one
 *      account), each subscribed to balance. Real and demo are both live, so
 *      switching is instant and both figures are always current. The same
 *      socket carries the scan's questions and the trades.
 *
 * Staying connected, which is the whole point:
 *   - a ping every 20 s; a socket that has said nothing for 50 s is treated as
 *     dead even if the browser still calls it open, and is replaced;
 *   - every reopen asks for a NEW one-time URL (single use), one request at a
 *     time per account, backing off 0.5 s … 30 s with jitter (Deriv allows 60
 *     REST calls a minute for one token);
 *   - coming back online or back to the tab reopens anything not live at once;
 *     a line already on its way is left to arrive (a waking phone fires several
 *     events together, and each must not throw away the line the last started);
 *   - a check every 30 s reopens any feed left closed; while a feed is down the
 *     balance is read over REST every 15 s.
 *
 * The token. Deriv's lasts about a month. Refused while no run is going: the
 * page's own re-sign-in takes over (event `cln:expired`). Refused during a run:
 * the run's open line is still authorised, so it finishes first — unless that
 * line is down too, when the page leaves for the re-sign-in at once and the run
 * resumes on return (cln-bot.js keeps it for the tab).
 *
 * The demo account stays out of sight until three taps on Real reveal it for
 * this visit (taps counted here: an iPhone reports every tap as a first click).
 */

(function (global) {
  "use strict";

  var CFG = global.ClnConfig || {};
  var APP_ID = CFG.appId || "";                       // Clunoid's Deriv app, 33PP…
  var ACCOUNTS_URL = "https://api.derivws.com/trading/v1/options/accounts";
  var TOKEN_KEY = "clunoid_deriv_access";            // the page's own sign-in (lib/deriv/oauth.ts)
  var PICK = "cln_smart_pick";                       // the account last shown
  var LAST = "cln_smart_last";                       // the last balances seen — figures only, never a token

  var PING_MS = 20000;
  var STALE_MS = 50000;
  var POLL_MS = 15000;

  var $ = function (id) { return document.getElementById(id); };
  var T = function (s) { return typeof global.t === "function" ? global.t(s) : s; };
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} },
  };

  function token() { return store.get(TOKEN_KEY) || ""; }

  /** Deriv's REST API with the token and the app id. Resolves { status, body, used } for
   *  any answer (`used`: the token it went with); rejects only when nothing came back. */
  function rest(method, url) {
    var tk = token();
    if (!tk) return Promise.resolve({ status: 401, body: {}, used: "" });
    return fetch(url, { method: method, cache: "no-store", headers: { "Authorization": "Bearer " + tk, "Deriv-App-ID": APP_ID } })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { status: r.status, body: b || {}, used: tk }; }); });
  }
  /** A refusal of a token that has since been replaced (a fresh sign-in landed) is not an expiry. */
  function stale(r) { return r.status === 401 && !!token() && token() !== r.used; }

  /* ── the states shown before there are balances ────────────────────── */

  var painted = false;
  function showBusy(text) {
    if (painted) return;
    $("tState").hidden = false;
    $("tBusy").hidden = false;
    $("tNote").hidden = true;
    $("tBusyText").textContent = T(text || "Connecting to Deriv…");
  }
  function showNote(text) {
    painted = false;
    $("acct").hidden = true;
    if ($("scan")) $("scan").hidden = true;
    $("tState").hidden = false;
    $("tBusy").hidden = true;
    $("tNote").hidden = false;
    $("tNoteText").textContent = T(text);
  }
  function clearState() { $("tState").hidden = true; }

  /** A bot run is going in this page (cln-bot.js). */
  function run() { try { return global.ClnBot && global.ClnBot.run && global.ClnBot.run(); } catch (e) { return null; } }
  function busy() { var r = run(); return !!(r && r.active); }

  /* ── the accounts ──────────────────────────────────────────────────── */

  var accounts = [];      // { id, type, currency, balance, status }
  var feeds = {};         // id → Feed
  var picked = null;      // the id shown
  var showDemo = false;   // the demo, revealed for this visit

  function isReal(a) {
    var t = String(a.account_type || a.type || "").toLowerCase(), id = String(a.account_id || a.loginid || "");
    if (t.indexOf("real") >= 0) return true;
    if (t.indexOf("demo") >= 0 || t.indexOf("virtual") >= 0) return false;
    return !/^(VR|DOT)/i.test(id);
  }
  function normal(list) {
    return (list || []).map(function (a) {
      var id = String(a.account_id || a.loginid || a.id || "");
      return { id: id, type: isReal(a) ? "real" : "demo", currency: a.currency || "", balance: a.balance != null ? Number(a.balance) : null, status: a.status || "active", at: Date.now() };
    }).filter(function (a) { return a.id; });
  }
  function listOf(body) {
    return Array.isArray(body.data) ? body.data : Array.isArray(body.accounts) ? body.accounts : (body.data && Array.isArray(body.data.accounts) ? body.data.accounts : []);
  }

  var bootTries = 0;
  function boot() {
    showBusy();
    if (!APP_ID) return showNote("Deriv sign-in isn't configured yet.");
    if (!token()) return expired();
    rest("GET", ACCOUNTS_URL).then(function (r) {
      if (stale(r)) return boot();
      if (r.status === 401) return expired();
      if (r.status >= 500 || r.status === 429) return bootLater();
      bootTries = 0;
      start(normal(listOf(r.body)));
    }).catch(bootLater);
  }
  function bootLater() {
    bootTries++;
    showBusy("Deriv is not answering yet — trying again…");
    setTimeout(boot, Math.min(30000, 1000 * Math.pow(2, bootTries)) * (0.75 + Math.random() * 0.5));
  }

  /** A run this tab is carrying through a reload (cln-bot.js keeps it in sessionStorage). */
  function savedRun() { try { return JSON.parse(sessionStorage.getItem("cln_smart_run") || "null"); } catch (e) { return null; } }

  function start(list) {
    accounts = list;
    if (!accounts.length) return showNote("This Deriv login has no trading accounts yet. Open one on Deriv, then come back here.");
    // A run on the demo that a reload interrupted resumes there: the toggle shows the demo with it.
    var sv = savedRun(), on = sv && account(sv.account);
    if (on && on.type === "demo") { showDemo = true; store.set(PICK, on.id); }
    picked = pickShown();
    if (!picked) return showNote("This Deriv login has no real account yet. Open one on Deriv, then come back here.");
    clearState();
    $("acct").hidden = false;
    painted = true;
    paint();
    accounts.forEach(function (a) {
      if (a.status !== "active") return;
      var f = feeds[a.id] || (feeds[a.id] = new Feed(a.id));
      f.retry(true);
    });
    startPolling();
  }

  function account(id) { return accounts.filter(function (a) { return a.id === id; })[0] || null; }
  function first(type) {
    var list = accounts.filter(function (a) { return a.type === type; });
    return list.filter(function (a) { return a.status === "active"; })[0] || list[0] || null;
  }
  /** The account shown: the last one picked if it is still shown, else the real one
   *  (the demo, when revealed, if there is no real). */
  function pickShown() {
    var saved = account(store.get(PICK));
    if (saved && (saved.type === "real" || showDemo)) return saved.id;
    var a = first("real") || (showDemo ? first("demo") : null);
    return a ? a.id : null;
  }

  /* ── painting: the balance pill and the Real / Demo toggle ─────────── */

  /** As a broker writes it: 1,234.56 USD. */
  function money(v, cur) {
    if (v == null || !isFinite(v)) return "—";
    var n = Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: /^(BTC|ETH|LTC|USDT|USDC|EUSDT|TUSDT|UST)$/i.test(cur || "") ? 8 : 2 });
    return cur ? n + " " + cur : n;
  }

  var savedAt = 0, saveLater = 0;
  function saveLast() {
    var wait = 2000 - (Date.now() - savedAt);
    if (wait > 0) { if (!saveLater) saveLater = setTimeout(function () { saveLater = 0; saveLast(); }, wait); return; }
    savedAt = Date.now();
    store.set(LAST, JSON.stringify(accounts.map(function (a) { return { id: a.id, type: a.type, currency: a.currency, balance: a.balance, status: a.status }; })));
  }
  /** The figures from last time, on screen before any request has gone out. */
  function paintLast() {
    var list = null;
    try { list = JSON.parse(store.get(LAST) || "null"); } catch (e) { list = null; }
    if (!Array.isArray(list) || !list.length) return;
    accounts = list.filter(function (a) { return a && a.id; }).map(function (a) {
      return { id: String(a.id), type: a.type === "real" ? "real" : "demo", currency: a.currency || "", balance: a.balance, status: a.status || "active", at: 0 };
    });
    picked = pickShown();
    if (!picked) return;
    $("acct").hidden = false;
    painted = true;
    paint();
  }

  function paint() {
    var a = account(picked);
    if (!a) return;
    saveLast();
    var box = $("acct"), f = feeds[a.id];
    box.classList.toggle("is-real", a.type === "real");
    box.classList.toggle("is-demo", a.type !== "real");
    box.classList.toggle("is-live", !!(f && f.live));
    box.classList.toggle("is-wait", !!(f && !f.live && f.started));
    $("acctAmt").textContent = money(a.balance, a.currency);
    paintModes();
    // Anything else on the page that shows the account (the bot) follows it.
    try { global.dispatchEvent(new CustomEvent("cln:account")); } catch (e) {}
  }
  function paintModes() {
    var a = account(picked), r = first("real"), d = first("demo"), running = busy();
    var html = "";
    [showDemo && d ? "demo" : null, "real"].forEach(function (m) {
      if (!m) return;
      var on = a && a.type === m, avail = m === "demo" ? !!d : !!r;
      html += '<button type="button" class="cln-mode-btn' + (on ? " is-on" : "") + '" data-mode="' + m + '"' +
        (running || !avail ? " disabled" : "") + ' aria-pressed="' + on + '"' +
        ' title="' + (!avail ? T("No " + m + " account on your Deriv connection") : running ? T("Stop the bot to switch accounts") : "") + '">' + T(m === "demo" ? "demo" : "real") + "</button>";
    });
    var box = $("acctModes");
    if (box.innerHTML !== html) box.innerHTML = html;
  }

  /* ── the toggle ────────────────────────────────────────────────────── */

  function bindToggle() {
    var count = 0, last = 0;
    $("acctModes").addEventListener("click", function (e) {
      var b = e.target.closest(".cln-mode-btn");
      if (!b || b.disabled || busy()) return;
      var m = b.getAttribute("data-mode");
      if (m === "real") {
        // Three taps on Real within 600 ms of each other reveal the demo for this visit.
        var now = Date.now();
        count = now - last <= 600 ? count + 1 : 1;
        last = now;
        if (count >= 3 && !showDemo && first("demo")) { count = 0; showDemo = true; paint(); return; }
      }
      var a = first(m);
      if (!a || a.id === picked) return;
      picked = a.id;
      store.set(PICK, picked);
      paint();
    });
  }

  /* ── one live feed per account ─────────────────────────────────────── */

  function Feed(id) {
    this.id = id;
    this.ws = null;
    this.live = false;       // a balance has arrived on the current socket
    this.started = false;    // has ever tried to connect
    this.tries = 0;
    this.last = 0;           // the last message of any kind
    this.timer = 0;
    this.pinger = 0;
    this.stopped = false;
    this.seq = 100;          // req_id 1 is the balance stream
    this.pending = {};       // req_id → { resolve, reject, timer }
    this.streams = {};       // req_id → function (message)
    this.waiting = false;    // a reconnect is scheduled
    this.fetching = false;   // a one-time URL is being asked for
  }
  /** Resolves once the socket is open, or rejects after `ms`. */
  Feed.prototype.whenOpen = function (ms) {
    var self = this;
    return new Promise(function (resolve, reject) {
      var until = Date.now() + (ms || 10000);
      (function check() {
        if (self.stopped) return reject(new Error("stopped"));
        if (self.ws && self.ws.readyState === 1) return resolve();
        if (Date.now() > until) return reject(new Error("Not connected to Deriv yet."));
        setTimeout(check, 120);
      })();
    });
  };
  /** One request, one answer — resolved even when the answer carries an error, so the
   *  caller reads Deriv's own reason. Rejects only when no answer could come. */
  Feed.prototype.ask = function (req, ms) {
    var self = this;
    return this.whenOpen(10000).then(function () {
      return new Promise(function (resolve, reject) {
        var id = ++self.seq;
        var t = setTimeout(function () { delete self.pending[id]; reject(new Error("Deriv did not answer in time.")); }, ms || 15000);
        self.pending[id] = { resolve: resolve, reject: reject, timer: t };
        try { self.ws.send(JSON.stringify(Object.assign({}, req, { req_id: id }))); }
        catch (e) { clearTimeout(t); delete self.pending[id]; reject(e); }
      });
    });
  };
  /** A request whose answers keep coming (a subscription, a buy with subscribe). `onMsg`
   *  gets every message for it, and { closed: true } if the line drops first. */
  Feed.prototype.stream = function (req, onMsg) {
    if (!this.ws || this.ws.readyState !== 1) return 0;
    var id = ++this.seq;
    this.streams[id] = onMsg;
    try { this.ws.send(JSON.stringify(Object.assign({}, req, { req_id: id }))); }
    catch (e) { delete this.streams[id]; return 0; }
    return id;
  };
  Feed.prototype.endStream = function (id) { delete this.streams[id]; };
  /** Everything waiting on this socket learns at once that it is gone. */
  Feed.prototype.failAll = function () {
    var p = this.pending, s = this.streams;
    this.pending = {}; this.streams = {};
    Object.keys(p).forEach(function (k) { clearTimeout(p[k].timer); p[k].reject(new Error("The connection to Deriv dropped.")); });
    Object.keys(s).forEach(function (k) { try { s[k]({ closed: true }); } catch (e) {} });
  };
  Feed.prototype.open = function (url) {
    var self = this;
    this.close();
    this.started = true;
    var ws;
    try { ws = new WebSocket(url); } catch (e) { return this.retry(); }
    this.ws = ws;
    // A socket that never opens is a socket that failed; do not wait on it.
    var guard = setTimeout(function () { if (ws.readyState !== 1) { try { ws.close(); } catch (e) {} } }, 12000);
    ws.onopen = function () {
      clearTimeout(guard);
      self.last = Date.now();
      ws.send(JSON.stringify({ balance: 1, subscribe: 1, req_id: 1 }));
      self.pinger = setInterval(function () { self.beat(); }, PING_MS);
    };
    ws.onmessage = function (ev) {
      self.last = Date.now();
      var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.req_id && m.req_id > 1) {
        var sub = self.streams[m.req_id];
        if (sub) { try { sub(m); } catch (e) {} return; }
        var w = self.pending[m.req_id];
        if (w) { delete self.pending[m.req_id]; clearTimeout(w.timer); w.resolve(m); }
        return;
      }
      if (m.error) {
        // A refused balance subscription: this socket cannot serve a balance — replace it.
        if (m.msg_type === "balance") self.drop();
        return;
      }
      if (m.msg_type === "balance" && m.balance) {
        var a = account(self.id);
        if (a) { a.balance = Number(m.balance.balance); if (m.balance.currency) a.currency = m.balance.currency; a.at = Date.now(); }
        self.live = true;
        self.tries = 0;
        paint();
      }
    };
    ws.onclose = function () {
      clearTimeout(guard);
      if (self.ws !== ws) return;          // an old socket already replaced
      self.ws = null;
      self.live = false;
      clearInterval(self.pinger);
      self.failAll();
      paint();
      if (!self.stopped) self.retry();
    };
    ws.onerror = function () { /* onclose follows and handles it */ };
  };
  /** After a network change: is this socket still really there? */
  Feed.prototype.probe = function () {
    var self = this, ws = this.ws;
    if (!ws || ws.readyState !== 1) return;
    var at = Date.now();
    try { ws.send(JSON.stringify({ ping: 1 })); } catch (e) { return this.drop(); }
    setTimeout(function () { if (self.ws === ws && self.last < at) self.drop(); }, 6000);
  };
  Feed.prototype.beat = function () {
    if (!this.ws || this.ws.readyState !== 1) return;
    if (Date.now() - this.last > STALE_MS) return this.drop();
    try { this.ws.send(JSON.stringify({ ping: 1 })); } catch (e) { this.drop(); }
  };
  /** Close the current socket without counting it as a failure of the line. */
  Feed.prototype.close = function () {
    clearInterval(this.pinger);
    clearTimeout(this.timer);
    var ws = this.ws;
    this.ws = null;
    this.live = false;
    if (ws) { ws.onclose = null; try { ws.close(); } catch (e) {} }
    this.failAll();
  };
  /** Throw away a socket that has gone quiet or bad, and open another now. */
  Feed.prototype.drop = function () { this.close(); this.retry(true); };
  Feed.prototype.stop = function () { this.stopped = true; this.close(); };
  Feed.prototype.retry = function (now) {
    var self = this;
    if (this.stopped) return;
    clearTimeout(this.timer);
    var wait = now ? 0 : Math.min(30000, 500 * Math.pow(2, this.tries)) * (0.75 + Math.random() * 0.5);
    this.tries = Math.min(this.tries + 1, 10);
    this.waiting = true;
    if (painted) paint();
    this.timer = setTimeout(function () {
      self.waiting = false;
      // One request for a URL at a time: the one in flight opens the line or retries.
      if (self.stopped || self.fetching) return;
      // Offline: keep trying on the backoff (the "online" event brings it back sooner).
      if (navigator.onLine === false) return self.retry();
      self.fetching = true;
      rest("POST", ACCOUNTS_URL + "/" + encodeURIComponent(self.id) + "/otp").then(function (r) {
        self.fetching = false;
        if (self.stopped) return;
        var url = r.body && ((r.body.data && r.body.data.url) || r.body.url);
        if (url) return self.open(url);
        if (stale(r)) return self.retry(true);
        if (r.status === 401) return expired(self.id);
        self.retry();
      }, function () { self.fetching = false; self.retry(); });
    }, wait);
  };

  /** Reopen anything that is not live, at once. A line already on its way is left to
   *  arrive: one still opening (its own 12 s guard ends one that hangs), or one whose
   *  URL is being asked for. */
  function revive() {
    Object.keys(feeds).forEach(function (id) {
      var f = feeds[id], ws = f.ws;
      if (f.stopped || f.fetching || (ws && ws.readyState === 0)) return;
      var stale = ws && ws.readyState === 1 && Date.now() - f.last > STALE_MS;
      if (!ws || ws.readyState > 1 || stale) { f.close(); f.tries = 0; f.retry(true); }
    });
  }

  var gone = false, owed = false;
  /** Deriv refused the token. With no run going, the page's re-sign-in takes over. During
   *  a run whose own line is up, the run finishes first (that line stays authorised); if
   *  the run's line is down too, it cannot trade on — leave for the re-sign-in now, and
   *  the run resumes on return. */
  function expired(feedId) {
    if (gone) return;
    var r = run();
    if (r && r.active) {
      var f = feeds[r.account];
      var lineDown = !f || !f.live || feedId === r.account;
      if (!lineDown) { owed = true; return; }
      global.__clnLeaving = true;      // cln-bot.js lets the page go without asking
    }
    gone = true;
    Object.keys(feeds).forEach(function (id) { feeds[id].stop(); });
    showNote("Your Deriv session has ended. Reconnecting…");
    try { global.dispatchEvent(new CustomEvent("cln:expired")); } catch (e) {}
  }

  /* ── the REST safety net ───────────────────────────────────────────── */

  var polling = 0;
  function startPolling() {
    if (polling) return;
    polling = setInterval(function () {
      if (document.visibilityState === "hidden" || gone) return;
      var a = account(picked), f = a && feeds[a.id];
      if (f && f.live) return;                          // the socket is doing the job
      rest("GET", ACCOUNTS_URL).then(function (r) {
        if (stale(r)) return;
        if (r.status === 401) return expired();
        normal(listOf(r.body)).forEach(function (n) {
          var o = account(n.id), nf = feeds[n.id];
          if (o && !(nf && nf.live) && n.balance != null) { o.balance = n.balance; o.currency = n.currency || o.currency; o.at = Date.now(); }
        });
        paint();
      }, function () {});
    }, POLL_MS);
  }

  /* ── keeping it up, quietly ────────────────────────────────────────── */

  global.addEventListener("cln:runend", function () { if (owed) setTimeout(expired, 0); paintModes(); });
  function probeAll() { Object.keys(feeds).forEach(function (id) { feeds[id].probe(); }); }
  if (navigator.connection && navigator.connection.addEventListener) navigator.connection.addEventListener("change", function () { revive(); probeAll(); });
  // Any feed left closed with nothing scheduled — whatever the reason — reopens.
  setInterval(function () {
    Object.keys(feeds).forEach(function (id) {
      var f = feeds[id];
      if (!f.stopped && !f.waiting && !f.fetching && (!f.ws || f.ws.readyState > 1)) { f.tries = 0; f.retry(true); }
    });
  }, 30000);

  /* ── go ────────────────────────────────────────────────────────────── */

  bindToggle();
  global.addEventListener("online", function () { revive(); probeAll(); });
  global.addEventListener("offline", function () { paint(); });
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") revive(); });
  global.addEventListener("pageshow", function (e) { if (e.persisted) revive(); });
  global.addEventListener("langchange", function () { paint(); });
  paintLast();
  boot();

  /* What the bot uses: the account shown, and its socket. */
  function current() {
    var a = account(picked), f = a && feeds[a.id];
    return a ? { id: a.id, type: a.type, currency: a.currency, balance: a.balance, live: !!(f && f.live) } : null;
  }
  global.ClnDeriv = {
    appId: APP_ID,
    accounts: function () { return accounts; },
    feeds: feeds,
    revive: revive,
    repaint: function () { if (painted) paint(); },
    current: current,
    /* Pinned to one account — what a running bot uses, so switching mid-run never
       moves its trades to the other account. */
    accountOf: function (id) {
      var a = account(id), f = a && feeds[a.id];
      return a ? { id: a.id, type: a.type, currency: a.currency, balance: a.balance, live: !!(f && f.live) } : null;
    },
    askOn: function (id, req, ms) {
      var f = feeds[id];
      return f ? f.ask(req, ms) : Promise.reject(new Error("No live connection for this account yet."));
    },
    streamOn: function (id, req, onMsg) {
      var f = feeds[id];
      if (!f) return null;
      var sid = f.stream(req, onMsg);
      return sid ? { end: function () { f.endStream(sid); } } : null;
    },
    whenOpenOn: function (id, ms) {
      var f = feeds[id];
      return f ? f.whenOpen(ms) : Promise.reject(new Error("No live connection for this account yet."));
    },
  };
})(window);
