# Clunoid Trading Desk — Architecture

AI-assisted, statistically validated FX day-trading analysis. Admin-only (`/trading`),
built to widen to all users by editing two allow-lists.

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
| Intraday + historical OHLCV | Yahoo chart API | verified: 1h×2y (17.5k bars), 15m/30m×60d, 1d×10y, all 5 majors, 1–2s latency, no key | TwelveData adapter built-in (activates with `TWELVEDATA_API_KEY`), Polygon/OANDA documented seams |
| Economic calendar | ForexFactory weekly JSON | verified live, high/med/low impact + forecast/previous, ~300ms, no key | Tavily news search (already integrated app-wide) |
| Spreads/slippage | Static conservative model | FX retail spreads are stable; modeled EXPENSIVE side (see `types.SPREAD_PIPS`) so validation under-promises | live spread feed when a broker API is added |

Yahoo is unofficial; mitigations: strict bar validator (drops, never repairs, malformed
bars), retries, provider seam, and admin-only internal analysis use.

## Validation methodology (fixed a priori — no metric shopping)
Anchored walk-forward on ~2y of H1 per pair (train 4000 bars ≈ 9mo → test 1000 ≈ 8wk,
step 8wk; params chosen on train by expectancy·√trades, scored ONLY on untouched test).
Costs in every simulated fill: half-spread + 0.3 pip slippage per side; stop-first rule
when a bar touches both stop and target; one position per pair; 60-bar expiry.
Gates (all must pass): OOS ≥30 trades · PF ≥1.15 · expectancy >0 · ≥55% windows
non-negative · ≥50% param-neighbors profitable · MC(5k, seeded) p95 DD ≤25R ·
P(profit) ≥80% · not losing in 2 of 3 ATR regimes.

**Result (run 2026-07-06, real data, after the look-ahead + honest-gap fixes):**
23/25 H1 candidates REJECTED. Champions: **AUDUSD squeezeBreakout** (41 OOS trades,
PF 1.46, +0.223R, MC p95 DD 6.3R, 100% neighborhood) and **USDCAD squeezeBreakout**
(63 OOS trades, PF 1.20). EURUSD, GBPUSD **and USDJPY**: **monitor-only** — no
candidate met the gates, so the system refuses to signal them.

Notably USDJPY trendPullback PASSED (PF 1.31) on the first run but was REJECTED
(PF 1.17, only 46% of walk-forward windows non-negative) once a look-ahead bug in
its swing-stop placement was fixed and weekend gaps were modeled honestly — the
validation caught its own overfit and pulled it from live trading. That is the
gate doing exactly what it must. Sub-hourly (M30) echoes all failed
micro-validation → live signals are H1-only until an LTF edge proves out. Full
dossiers: `research/reports.json`, rendered in the Playbooks tab.

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
  that pair — nothing is interpolated to keep a scan "complete".
- **Scan cadence — fully autonomous, zero cost:** the primary scheduler is
  **Supabase pg_cron + pg_net** (migration `20260706150000_trading_cron`): job
  `trading-scan-15m` fires `POST /api/trading/scan` with the CRON_SECRET bearer
  every 15 minutes, 24/7, from inside the database — no browser, no Vercel Pro,
  no third-party service. Belt-and-braces layers on top: a daily Vercel Hobby
  cron (`vercel.json`) and the terminal's self-healing loop (scans while open if
  the last heartbeat is >12 min old). Observability:
  `select * from cron.job_run_details order by start_time desc` + the app-level
  heartbeats in `trading_scans` (Health rail).
