# Scoring

How Life OS turns data into numbers. Code: `src/lib/scoring` (pure
TypeScript; ESLint forbids framework, database and app imports). Spec:
§3, §8–§10, §33–§35.

```
STATE                                        EXECUTION
metric events                                weekly commitments
  → metric score (0–100)                       → completion (0–1)
  → category score                             → Week Score (0–100)
  → Life Score → rank
```

The two chains share nothing. A Life Score never reads commitments; a Week
Score never reads metric values.

## 1. Metric value

Each metric is evaluated over a **trailing window of local calendar days**
ending on the local date of `asOf`, in the user's timezone:

| period    | window        |
| --------- | ------------- |
| daily     | today         |
| weekly    | last 7 days   |
| monthly   | last 30 days  |
| quarterly | last 91 days  |
| yearly    | last 365 days |
| all_time  | all history   |

Events are deduplicated (same id, or same `source` + `external_record_id`),
future-dated events are ignored, then aggregated: `sum`, `avg`, `min`,
`max`, `latest`, `count`.

**Empty window**

| situation                                    | result                         |
| -------------------------------------------- | ------------------------------ |
| never recorded anything                      | missing (`never_recorded`)     |
| `sum`/`count`, earlier history, empty window | **0** (nothing happened)       |
| `avg`/`min`/`max`/`latest`, empty window     | missing (`no_data_in_window`)  |
| source integration unavailable               | missing (`source_unavailable`) |

`config.emptyWindow: "zero" | "missing"` overrides the default.

## 2. Metric score (0–100)

Configured in `metric_definitions.config`, validated per direction (unknown
keys are rejected). An invalid config marks only that metric as `error`.

| direction          | config                                                                                         | formula                                                                                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `higher_is_better` | `target`, `baseline`=0                                                                         | (v − baseline) / (target − baseline) × 100                                                                                                                      |
| `lower_is_better`  | `target`, optional `worst`                                                                     | with worst: (worst − v) / (worst − target) × 100; else target / v × 100 (v ≤ 0 → 100)                                                                           |
| `target_range`     | `targetMin`, `targetMax`, `tolerance`/`toleranceBelow`/`toleranceAbove` (default: range width) | inside → 100; outside → 100 × (1 − distance / tolerance)                                                                                                        |
| `boolean`          | —                                                                                              | v > 0 → 100, else 0                                                                                                                                             |
| `milestone`        | `milestones: [{ value, score, label }]` ascending                                              | score of the highest milestone with value ≤ v (step, no interpolation); below the first → 0                                                                     |
| `ratio`            | `target`; optional `numerator`, `denominator` metric keys, `minDenominator`=1                  | ratio / target × 100. With keys, ratio = aggregated numerator / denominator over this metric's window; below `minDenominator` → missing (`insufficient_sample`) |
| `custom`           | `points: [{ value, score }]` ascending, ≥ 2                                                    | linear interpolation; flat outside the first/last point                                                                                                         |

Every score is clamped to 0–100. The unclamped `rawScore` is kept and
`overperformance_capped` / `underperformance_floored` is reported:
overperformance is visible but never rewarded (spec §3.2).

## 3. Category score and Life Score

```
category score = Σ(metric score × w)   over metrics WITH a score
Life Score     = Σ(category score × w) over categories WITH a score
```

Weights are relative and normalised. Disabled categories/metrics are
excluded entirely; zero-weight metrics are shown but contribute nothing.
Items without a score are re-weighted out — and that is made visible:

- **completeness** = weighted share of items that have a score (spec §34).
- **confidence** = weighted mean of metric confidence, where metric
  confidence = mean event confidence × freshness factor (fresh 1,
  delayed 0.75, stale 0.5, missing/error 0). Never mixed into the score
  (spec §35).

A metric with more than 50 % of its category's weight is flagged
`dominant_metric` (spec §9.5).

**Explainability invariant (tested):** every metric reports
`categoryContribution` and `lifeContribution` in points. They sum exactly
to the category score and to the Life Score.

No scored data → `score: null`, `rank: null`. Never zero.

## 4. Freshness (spec §33)

Age = local days since the latest event.

| period     | fresh     | delayed      | stale     |
| ---------- | --------- | ------------ | --------- |
| windowed   | < period  | < 2 × period | otherwise |
| `all_time` | < 30 days | < 90 days    | otherwise |

`missing` = no events; `error` = invalid config or source unavailable.

## 5. Rank (spec §5)

| displayed score | rank        |
| --------------- | ----------- |
| 0–29            | D           |
| 30–44           | C           |
| 45–59           | B           |
| 60–74           | A           |
| 75–89           | S           |
| 90–99           | World Class |
| 100             | Complete    |

Scores are displayed **floored** (`displayScore`) and the rank uses the
displayed number, so they always agree: 29.9 shows "29 · D", 99.6 shows
"99 · World Class". "Complete" requires exactly 100. Calculations keep full
precision.

## 6. Week Score (spec §10)

```
completion = min(actual / target, 1)          quantity
completion = actual ≥ 1 ? 1 : 0               boolean
Week Score = Σ(completion × w) × 100           cancelled commitments excluded
```

Doing more than the target earns nothing extra. `executionRate` =
completed / total, unweighted ("7 / 9 completed"). No commitments → `null`.

## 6b. Weekly review (spec §7.3, ADR-025)

`buildWeeklyReview({ lifeStart, lifeEnd, week })` — both Life Scores
computed with the same configuration, at the end of the day before the
week and at the end of its last day (or now). It reports:

- Life Score start/end/delta and the Week Score **side by side**.
- Per-category start/end/delta (null unless both ends have data); biggest
  gain (largest Δ > 0), biggest decline (largest Δ < 0), strongest and
  weakest at the end.
- Off-target metrics: scored and below 100, ranked by
  `potentialGain = (100 − score) × metric effective share × category
effective share` — exactly the Life Score points reaching the target
  would add. The first is the **bottleneck**.
- Improving fastest: metrics with Δ > 0.
- Stagnant despite execution: only if Week Score ≥ 80; metrics in
  categories that had commitments, |Δ| < 1, below target.
- Focus, first rule that applies: no commitments → plan; Week Score < 50 →
  execution; bottleneck → that metric; no data → collect data.

## 6c. History (ADR-028)

`lifeScoreAsOf(inputs, instant)` picks the version in force at
`instant` (the first version for earlier dates), applies its stored
configuration to today's definitions by key — weights, enabled flags,
directions, targets — and scores the event log at that instant. Metrics
created later use their first recorded configuration. A past date is
scored at the end of its local day; today, at now. `compareLifeScores`
diffs two such results.

## 7. Score versions

`buildScoreConfiguration()` captures what determines scores — category
weights/enabled, metric category/direction/period/aggregation/weight/
enabled/config, engine version — and nothing cosmetic (names, order).
`requiresNewScoreVersion()` compares canonical serialisations; any change
means a new `score_versions` row, so history keeps its original meaning.
Bump `SCORE_ENGINE_VERSION` when formulas change.

## Issue codes

The engine returns codes, never user-facing text; the UI translates them.
See `ScoreIssue` in `src/lib/scoring/types.ts`.
