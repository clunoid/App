# Clunoid Trading Desk — Architecture

AI-assisted, statistically validated multi-asset trading analysis across 18
markets: seven USD majors, five liquid crosses, two metals (gold, silver), two
energies (WTI, natgas) and two equity indices (S&P 500, Nasdaq 100 — CME/NYMEX
futures feeds). Admin-only (`/trading`), built to widen to all users by editing
two allow-lists.

```
┌─ DATA ────────────────┐   ┌─ RESEARCH (offline) ─────────────┐
│ data.ts               │   │ research/run.ts  (npx tsx …)     │
│  Yahoo chart API      │──▶│  walk-forward → OOS metrics →    │
│  (15m/30m 60d,        │   │  Monte Carlo → neighborhood →    │
│   1h 2y, 1d 10y)      │   │  regime → GATES                  │
│  TwelveData fallback  │   │  ├─ reports.json  (all dossiers) │
│  ForexFactory cal.    │   │  └─ playbooks.json (champions)   │
└───────────┬───────────┘   └───────────────┬──────────────────┘
            │                               │ baked at build
┌───────────▼───────────────────────────────▼──────────────────┐
│ QUANT CORE (pure TS, no framework imports — one source of    │
│ truth for research AND live):                                │
│  types.ts · indicators.ts · sessions.ts · strategies.ts      │
│  backtest.ts · validate.ts · engine.ts                       │
└───────────┬──────────────────────────────────────────────────┘
            │
┌───────────▼─────────────┐    ┌─ AI (annotation only) ─┐
│ /api/trading/scan       │───▶│ ai.ts → Sonnet         │
│  cron (15min) + on-view │    │ explains; never decides│
│  resolve → detect →     │    └────────────────────────┘
│  filter → score → save  │
└───────────┬─────────────┘
            │ service role                     ┌─ UI ────────────────┐
┌───────────▼─────────────┐  RLS (admin read)  │ /trading Terminal   │
│ Supabase                │◀──────────────────▶│ watchlist · signals │
│  trading_signals        │  /api/trading/state│ chart (lightweight- │
│  trading_scans          │                    │ charts) · playbooks │
└─────────────────────────┘                    │ history · calendar  │
                                               │ health · alerts     │
                                               └─────────────────────┘
```

## Provider selection (evaluated live before implementation)
| Need | Chosen | Why | Alternates |
|---|---|---|---|
| Intraday + historical OHLCV | Yahoo chart API | verified live for all 18 markets: FX `<PAIR>=X` 1h×2y (~17.2k bars, 0 OHLC-inconsistent rows); futures GC=F/SI=F/CL=F/NG=F/ES=F/NQ=F 1h×~2.4y (~13.7k bars, 0 inconsistent — spot metals 404 and cash indices are :30-stamped, so futures are the clean feeds); 15m/30m×60d. 2h/4h resampled from 1h by ONE shared code path (`data.resampleBars`), completeness judged by each market's OWN clock (FX 24/5 vs Globex daily halt) | TwelveData adapter (FX ONLY — its symbol grammar can't name futures; futures fail honestly and retry next scan) |
| Economic calendar | ForexFactory weekly JSON | verified live, high/med/low impact + forecast/previous, ~300ms, no key | Tavily news search (already integrated app-wide) |
| Spreads/slippage | Static conservative model | FX retail spreads are stable; modeled EXPENSIVE side (see `types.SPREAD_PIPS`) so validation under-promises | live spread feed when a broker API is added |

Yahoo is unofficial; mitigations: strict bar validator (drops, never repairs, malformed
bars), retries, provider seam, and admin-only internal analysis use.

## Validation methodology (fixed a priori — no metric shopping)
Anchored walk-forward on ~2y per pair on THREE timeframes — H1 (train 4000 bars ≈
9mo → test 1000 ≈ 8wk), H2 (2000→500) and H4 (1000→250): identical calendar spans,
identical gates, params chosen on train by expectancy·√trades, scored ONLY on the
untouched test. Costs in every simulated fill: half-spread + 0.3 pip slippage per
side; stop-first rule when a bar touches both stop and target; one position per
pair; 60-bar expiry (or the strategy's own same-day time box via `Setup.maxBars` —
honored by the backtester and the live resolver through the SAME expiry path).
Gates (all must pass, NEVER lowered): OOS ≥30 trades · PF ≥1.15 · expectancy >0 ·
≥55% windows non-negative · ≥50% param-neighbors profitable · MC(5k, seeded) p95
DD ≤25R · P(profit) ≥80% · not losing in 2 of 3 ATR regimes.

20 strategy families: the 12 of the 2026-07-06 cohort; five 2026-07-07
literature-anchored additions — asianCompression (Crabel contraction→expansion at
the London open, with a built-in filter-off ablation cell), breakoutRetest
(two-stage prior-day-extreme break + held retest), nr7Breakout (Crabel NR-N daily
compression, params published 1990 = 35y out-of-sample priors), londonCloseFade
(Evans 2018 / FCA OP46 fix-flow reversal) and adrExhaustionFade (daily range-budget
base rates; all params in ADR units, scale-free across pairs); and the 2026-07
EXIT-ENGINEERING cohort — chandelierTrend (time-series momentum entry, LeBeau
chandelier trailing exit on the FROZEN signal-bar ATR, the only design where the
live resolver replays the exact trail the backtest saw), reversionChandelier (the
pre-registered EURGBP candidate: wide 3×ATR target + chandelier give-back guard +
2-3 day time box, because a 2.1-pip round trip eats tight targets whole) and
usOpenChandelier (Crabel/Zarattini-Aziz US cash-open range breakout with a
direction-filter ablation cell). Trailing stops mirror EXACTLY between backtest
and live: ratchet updates at the bottom of each bar iteration (no intrabar
look-ahead), gap clamps on the effective stop, R denominated in the ORIGINAL stop.

**Result (run 2026-07-07 final, real data, 19 markets × 20 families × 3
timeframes = 1281 dossiers): 18/19 markets live, EURGBP monitor-only.**

| Market | Champions (OOS) | Market | Champions (OOS) |
|---|---|---|---|
| EURUSD | emaCrossTrend@1h · PF 1.64 | AUDCAD | rsi2Reversion@4h · PF 1.45 + londonCloseFade@2h |
| GBPUSD | trendPullback@4h · PF 1.70 + nr7@4h | XAUUSD | chandelierTrend@2h · PF 1.54 + nr7Breakout@1h · **PF 2.88** |
| USDJPY | trendPullback@1h · 134tr · PF 1.43 | XAGUSD | keltnerPullback@30m · PF 2.97 + chandelierTrend@4h · PF 1.59 |
| USDCHF | keltnerPullback@4h + squeeze@1h | USOIL | breakoutRetest@4h · PF 1.25 |
| AUDUSD | squeezeBreakout@1h · PF 1.45 | NATGAS | reversionChandelier@2h · PF 1.18 |
| NZDUSD | chandelierTrend@30m + emaCross@1h | SPX500 | insideBarBreakout@1h · PF 1.81 + rangeFade@2h · PF 1.54 |
| USDCAD | emaCrossTrend@1h · PF 1.97 + breakoutRetest@2h | NAS100 | nyOpenRange@1h · PF 1.35 + nr7Breakout@4h · PF 1.70 |
| EURJPY | asianCompression@4h · **PF 2.11** + @2h | US30 | rangeFade@4h · PF 1.77 + rangeFade@1h · PF 1.28 |
| GBPJPY | rsi2Reversion@4h + reversionChandelier@2h | **EURGBP** | **monitor-only** (see below) |
| AUDJPY | trendPullback@4h · PF 1.40 | | |

**EURGBP — the honest exception.** ~110 candidates have now been examined across
three research campaigns, including a PRE-REGISTERED final cohort purpose-built
from its failure analysis (reversionChandelier: wide-target reversion with a
chandelier give-back guard — the only economically grounded mechanism left for a
market whose 2.1-pip round trip eats tight targets whole). It failed decisively
(PF 0.57–0.95, 0% neighborhoods). The multiple-testing budget on this market is
SPENT: further searching would be curve-fitting, not research. It ships fully
monitored (quotes, chart, regime, news) and is re-audited by every future
research run; the desk refuses to trade it until real evidence exists. US30
(Dow futures — rangeFade@4h · 31tr · PF 1.77 · +0.409R) joined the universe so
the desk still fields 18 LIVE markets without lowering any bar.

Notes: the exit-engineering cohort earned 6 champion seats on merit
(chandelierTrend ×3, reversionChandelier ×2, and GBPJPY's runner-up) — trailing
exits, not looser gates, is what unlocked several of these markets. Two 30m
champions (NZDUSD, XAGUSD) arose under the documented micro-validation rules
(same-family HTF pass required, reduced-depth gates, −6 live confidence
penalty). Futures validate on ~2.4y of history (feed depth) vs FX's 2y — same
gates, ~8-9 walk-forward windows vs 13.

MULTIPLE-TESTING DISCLOSURE: ~1,200 full-depth candidates were examined against
fixed gates across the 19-market universe; at this breadth a naive PF cutoff
alone would admit several false positives by chance. The window-consistency,
parameter-neighborhood, Monte-Carlo and regime gates are the false-discovery
control, and champions cap at 2 per market. Two honesty flags recorded rather than hidden: (1) USDJPY trendPullback@1h
sat at 25% neighborhood in the 2026-07-06 snapshot and 60% in this one — the
walk-forward's final-window parameter choice moved to a healthier plateau as the
730-day data window rolled; the candidate lives near the gate boundary, which the
confidence engine already prices via its PF-based score. Three other USDJPY
families passing independently is the stronger pair-level evidence. (2) Walk-
forward results are window-alignment sensitive: every run stamps its own
dataStart/dataEnd in the dossier, and re-running research re-decides champions
from scratch. Live outcomes accruing in trading_signals are the final arbiter.

History note: USDJPY trendPullback PASSED (PF 1.31) on the very first 5-pair run,
was REJECTED once a look-ahead bug in its swing-stop placement was fixed (the
harness catching its own overfit), and re-passed here on a healthier parameter
plateau with three corroborating families. Sub-hourly (M30) echoes all failed
micro-validation → no sub-hourly signals ship. Full dossiers:
`research/reports.json`, rendered in the Playbooks tab.

Re-run research anytime: `npx tsx lib/trading/research/run.ts` (rewrites both
JSONs). For long runs, chunk by market and merge:
`RESEARCH_PAIRS="XAUUSD,USOIL" RESEARCH_OUT=part1 npx tsx lib/trading/research/run.ts`
then `npx tsx lib/trading/research/merge.ts part1 part2 …` (refuses partial
universes; deletes the part files). Smoke-test a live cycle (including the
fixed/time-boxed/trailing mirror assertions): `npx tsx lib/trading/research/smoke.ts`.

## Live signal lifecycle
scan (cron `*/15` + terminal self-heal >12min) → resolve open signals against fresh
bars (same touch rules as the backtest) → run champions on CLOSED bars only → a setup
on the newest closed bar becomes a candidate → filters: news blackout (±45min
high-impact on either currency → suppress; ±120min → confidence −10), ATR-percentile
regime, spread sanity, sub-hourly penalty → confidence 0–100 (base = champion's OOS
PF; fully deterministic) → `< 65` = no signal → Sonnet annotation (best-effort) →
insert (deduped on pair+strategy+tf+direction+bar) → browser notification in terminal.

## Alerts — autonomous Web Push
Signals are pushed from the SERVER the instant one is persisted, so they arrive
even with the tab closed, the page refreshed, or the laptop just woken — nothing
depends on a page being open. Flow: the scanner inserts a validated signal →
`lib/trading/push.ts` sends a Web Push (VAPID) to every subscribed device →
`public/trading-sw.js` (a push-only service worker with NO fetch handler, so it
can't touch anything else) renders the notification. Opt in once via the bell in
the terminal header: it registers the service worker, subscribes, stores the
subscription in `trading_push_subs` (admin-RLS, service-role writes) and fires a
confirmation push so you SEE it works. The bell reflects the REAL subscription,
so it stays on across reloads. Dead subscriptions (404/410) self-prune. Why you
might see few alerts: signals are rare BY DESIGN — confidence ≥65, a champion
must fire on the newest CLOSED bar — so many scans legitimately produce none
("no trade" is the intended output). The private VAPID key lives only in server
env; the browser only ever gets the public key.

## Security & rollout
- Server: every `/api/trading/*` request verifies the session against the immutable
  admin id allow-list (same mechanism as billing). Cron authorizes via `CRON_SECRET`
  (provisioned on Vercel). Writes go through the service role only.
- DB: RLS `is_trading_admin()` on both tables; no client write policies at all.
- UI: route exists but is linked nowhere; non-admins get the Restricted screen.
- **Widening access later** = update `is_trading_admin()` + `ADMIN_USER_IDS` check in
  the two routes (or swap to a `plan='max'` predicate). Nothing else changes.

## Operational notes
- Heartbeats in `trading_scans` (pruned to last 2000) power the Health rail.
- Correctness beats availability: a pair's fetch failure records an error and skips
  that pair — nothing is interpolated to keep a scan "complete". Likewise a 2h/4h
  bucket missing an hour the market traded (feed drop, unmodeled holiday) is
  dropped whole, and outcome resolution judges bar-closedness at FETCH time, not
  resolve time, so a boundary falling mid-scan can only delay a verdict, never
  corrupt one.
- **Economic calendar is DB-cached** (`trading_calendar`, single row). The
  ForexFactory feed rate-limits hard (429 after a couple of rapid requests), so
  the scanner is its ONLY fetcher — once per 5-min cycle, upserting on success
  and never wiping good data on failure. The terminal reads the cache, so the
  display is stable; a `calendarLoaded` flag distinguishes "not fetched yet"
  (shows "Loading…") from a genuine quiet week (shows "Quiet"). The scanner also
  reuses the cached copy for its own news-blackout gating when a fetch misses.
- Live mirrors the backtester's one-position rule: while a champion has an open
  signal, its re-fires are skipped (not stacked), so the live R ledger contains
  only trades the validation would also have taken.
- 1h live fetch window is 30d (was 20d) so the 400-bar volatility-percentile
  regime gate sees the same depth it saw in validation — a deliberate 2026-07-07
  recalibration, one-time shift in live volRegime/confidence inputs.
- The TwelveData fallback's free tier (8 req/min) cannot cover a full Yahoo
  outage across 18 markets in one sweep — during such an outage some markets
  error per-scan and retry next cycle; known, accepted (fallback is best-effort,
  and FX-only: futures never silently substitute a spot feed).
- **Scan cadence — fully autonomous, zero cost:** the primary scheduler is
  **Supabase pg_cron + pg_net** (migration `20260706150000_trading_cron`): job
  `trading-scan-15m` fires `POST /api/trading/scan` with the CRON_SECRET bearer
  every **5 minutes** (tightened from 15 for lower alert latency; the jobname is
  historical), 24/7, from inside the database — no browser, no Vercel Pro,
  no third-party service. Belt-and-braces layers on top: a daily Vercel Hobby
  cron (`vercel.json`) and the terminal's self-healing loop (scans while open if
  the last heartbeat is >12 min old). Observability:
  `select * from cron.job_run_details order by start_time desc` + the app-level
  heartbeats in `trading_scans` (Health rail).
