import { MAX_SCORE, MIN_SCORE } from "./normalize";
import type { Rank } from "./types";

/** Spec §5. Inclusive bounds on the displayed (whole-number) score. */
export const DEFAULT_RANKS: readonly Rank[] = [
  { key: "D", label: "D", min: 0, max: 29 },
  { key: "C", label: "C", min: 30, max: 44 },
  { key: "B", label: "B", min: 45, max: 59 },
  { key: "A", label: "A", min: 60, max: 74 },
  { key: "S", label: "S", min: 75, max: 89 },
  { key: "world_class", label: "World Class", min: 90, max: 99 },
  { key: "complete", label: "Complete", min: 100, max: 100 },
];

/**
 * The whole number shown to the user. Scores are floored, never rounded:
 * 29.9 must not display as 30 (a rank it hasn't reached), and 99.6 must
 * not display as 100 ("Complete" means the target is fully conquered).
 * Calculations keep full precision (spec §45 "false precision").
 */
export function displayScore(score: number): number {
  // The epsilon absorbs float noise such as 59.99999999999999.
  const floored = Math.floor(score + 1e-9);
  return Math.min(MAX_SCORE, Math.max(MIN_SCORE, floored));
}

export function rankFor(
  score: number | null,
  ranks: readonly Rank[] = DEFAULT_RANKS,
): Rank | null {
  if (score === null || !Number.isFinite(score)) return null;
  const shown = displayScore(score);
  return ranks.find((rank) => shown >= rank.min && shown <= rank.max) ?? null;
}
