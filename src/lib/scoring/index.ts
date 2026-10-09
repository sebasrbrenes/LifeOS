/**
 * Life OS score engine — pure TypeScript, no framework or database
 * dependencies (enforced by ESLint). See docs/SCORING.md.
 *
 *   Metric Score → Category Score → Life Score → Rank      (state)
 *   Weekly commitments → completion → Week Score            (execution)
 *
 * The two scores are computed independently and must never be combined.
 */
export {
  SCORE_ENGINE_VERSION,
  buildScoreConfiguration,
  requiresNewScoreVersion,
  scoreConfigurationSchema,
  serializeScoreConfiguration,
  type ScoreConfiguration,
} from "./configuration";
export { ScoringInputError } from "./errors";
export {
  DOMINANT_METRIC_SHARE,
  categoryExtremes,
  computeLifeScore,
  type LifeScoreInputs,
} from "./life-score";
export {
  METRIC_CONFIG_SCHEMAS,
  parseMetricConfig,
  type MetricConfigByDirection,
  type ParsedMetricConfig,
} from "./metric-config";
export { scoreMetric } from "./metric-score";
export { DEFAULT_RANKS, displayScore, rankFor } from "./rank";
export {
  addDays,
  daysBetween,
  endOfLocalDay,
  endOfWeek,
  evaluationWindow,
  isValidTimeZone,
  localDate,
  localDateToInstant,
  startOfLocalDay,
  startOfWeek,
  type DateWindow,
  type LocalDate,
} from "./time";
export type * from "./types";
export * from "./vocabulary";
export { commitmentCompletion, computeWeekScore } from "./week-score";
export {
  HIGH_EXECUTION_SCORE,
  LOW_EXECUTION_SCORE,
  STAGNANT_DELTA,
  WEEKLY_REVIEW_SUMMARY_VERSION,
  buildWeeklyReview,
  metricGaps,
  type CategoryChange,
  type MetricChange,
  type MetricGap,
  type WeeklyFocus,
  type WeeklyReviewInputs,
  type WeeklyReviewSummary,
} from "./weekly-review";
export {
  applyConfiguration,
  compareLifeScores,
  instantForDate,
  lifeScoreAsOf,
  lifeScoreHistory,
  sampleDates,
  versionAt,
  type HistoricalLifeScore,
  type HistoryInputs,
  type HistoryPoint,
  type MetricComparisonRow,
  type ScoreBasis,
  type ScoreComparison,
  type ScoreComparisonRow,
  type StoredScoreVersion,
} from "./history";
export {
  DIAGNOSTIC_HIGH_EXECUTION,
  DIAGNOSTIC_LOW_EXECUTION,
  DIAGNOSTIC_MIN_WEEKS,
  DIAGNOSTIC_OUTCOME_THRESHOLD,
  TREND_FLAT_DELTA,
  categoryExecution,
  scoreTrends,
  strategyDiagnostics,
  trendOf,
  type CategoryDiagnostic,
  type ClosedWeek,
  type DiagnosticCode,
  type ScoreTrend,
  type TrendDirection,
  type TrendRow,
} from "./analytics";
