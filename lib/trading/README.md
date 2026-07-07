# Clunoid Trading Desk — Architecture

AI-assisted, statistically validated FX trading analysis across 12 markets (all
seven USD majors + the five most liquid crosses). Admin-only (`/trading`), built
to widen to all users by editing two allow-lists.

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
| Intraday + historical OHLCV | Yahoo chart API | verified live for all 12 pairs: 1h×2y (~17.2k bars each, 0 OHLC-inconsistent rows), 15m/30m×60d, 1–2s latency, no key. 2h/4h are resampled from 1h by ONE shared code path (`data.resampleBars`) in research and live | TwelveData adapter built-in (activates with `TWELVEDATA_API_KEY`), Polygon/OANDA documented seams |
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

17 strategy families: the 12 of the 2026-07-06 cohort plus five 2026-07-07
literature-anchored additions — asianCompression (Crabel contraction→expansion at
the London open, with a built-in filter-off ablation cell), breakoutRetest
(two-stage prior-day-extreme break + held retest), nr7Breakout (Crabel NR-N daily
compression, params published 1990 = 35y out-of-sample priors), londonCloseFade
(Evans 2018 / FCA OP46 fix-flow reversal) and adrExhaustionFade (daily range-budget
base rates; all params in ADR units, scale-free across pairs).

**Result (run 2026-07-07 final, real data, 12 pairs × 17 families × 3 timeframes
= 672 dossiers, post-adversarial-review code): 11/12 markets validated, 19 live
champions from 21 full-depth passes.**

| Market | Champions (OOS) |
|---|---|
| EURUSD | emaCrossTrend@1h · 43tr · PF 1.64 · nb 100% |
| GBPUSD | **trendPullback@4h · 49tr · PF 1.70** + nr7Breakout@4h · PF 1.22 (H4 was the missing dimension) |
| USDJPY | **trendPullback@1h · 134tr · PF 1.43 · +0.250R** |
| USDCHF | keltnerPullback@4h · 81tr · PF 1.38 + squeezeBreakout@1h · PF 1.44 |
| AUDUSD | squeezeBreakout@1h · 41tr · PF 1.45 · nb 100% |
| NZDUSD | emaCrossTrend@1h · 41tr · PF 1.49 |
| USDCAD | emaCrossTrend@1h · PF 1.97 + breakoutRetest@2h · 62tr · PF 1.64 · nb 100% |
| EURGBP | **monitor-only** — best of 51 candidates: PF 1.06 < 1.15 (honest no-trade) |
| EURJPY | asianCompression@4h · 47tr · **PF 2.11** + @2h · PF 1.51 (also passed @1h, 197tr) |
| GBPJPY | rsi2Reversion@4h · 87tr · PF 1.20 + nr7Breakout@1h · PF 1.24 |
| AUDJPY | trendPullback@4h · 35tr · PF 1.40 · nb 100% |
| AUDCAD | rsi2Reversion@4h · 69tr · PF 1.45 + londonCloseFade@2h · PF 1.51 · dd 1.5R |

The GBPUSD/USDJPY breakthrough came from ENLARGING THE HYPOTHESIS SPACE (2h/4h
timeframes + five new families), never from touching a gate. EURGBP found
nothing net of costs across 51 candidates and correctly ships as monitor-only —
no trade is the designed output for weak evidence. Candidates that sat exactly
on a gate edge in the pre-review snapshot (USDJPY squeezeBreakout@2h at 30
trades, AUDUSD asianCompression@2h at PF 1.15) fell out when the resample
completeness rule tightened the 2h/4h series — gate-boundary evidence is
fragile by nature and the desk simply doesn't trade it.

MULTIPLE-TESTING DISCLOSURE: ~612 full-depth candidates were examined against
fixed gates; at this breadth a naive PF cutoff alone would admit several false
positives by chance. The window-consistency, parameter-neighborhood, Monte-Carlo
and regime gates are the false-discovery control, and champions cap at 2 per
pair. Two honesty flags recorded rather than hidden: (1) USDJPY trendPullback@1h
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

Re-run research anytime: `npx tsx lib/trading/research/run.ts` (rewrites both JSONs);
smoke-test a live cycle: `npx tsx lib/trading/research/smoke.ts`.

## Live signal lifecycle
scan (cron `*/15` + terminal self-heal >12min) → resolve open signals against fresh
bars (same touch rules as the backtest) → run champions on CLOSED bars only → a setup
on the newest closed bar becomes a candidate → filters: news blackout (±45min
high-impact on either currency → suppress; ±120min → confidence −10), ATR-percentile
regime, spread sanity, sub-hourly penalty → confidence 0–100 (base = champion's OOS
PF; fully deterministic) → `< 65` = no signal → Sonnet annotation (best-effort) →
insert (deduped on pair+strategy+tf+direction+bar) → browser notification in terminal.

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
- Live mirrors the backtester's one-position rule: while a champion has an open
  signal, its re-fires are skipped (not stacked), so the live R ledger contains
  only trades the validation would also have taken.
- 1h live fetch window is 30d (was 20d) so the 400-bar volatility-percentile
  regime gate sees the same depth it saw in validation — a deliberate 2026-07-07
  recalibration, one-time shift in live volRegime/confidence inputs.
- The TwelveData fallback's free tier (8 req/min) cannot cover a full Yahoo
  outage across 12 pairs in one sweep — during such an outage some pairs error
  per-scan and retry next cycle; known, accepted (fallback is best-effort).
- **Scan cadence — fully autonomous, zero cost:** the primary scheduler is
  **Supabase pg_cron + pg_net** (migration `20260706150000_trading_cron`): job
  `trading-scan-15m` fires `POST /api/trading/scan` with the CRON_SECRET bearer
  every 15 minutes, 24/7, from inside the database — no browser, no Vercel Pro,
  no third-party service. Belt-and-braces layers on top: a daily Vercel Hobby
  cron (`vercel.json`) and the terminal's self-healing loop (scans while open if
  the last heartbeat is >12 min old). Observability:
  `select * from cron.job_run_details order by start_time desc` + the app-level
  heartbeats in `trading_scans` (Health rail).
