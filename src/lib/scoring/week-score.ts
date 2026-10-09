import { ScoringInputError } from "./errors";
import { MAX_SCORE, MIN_SCORE } from "./normalize";
import type {
  CommitmentInput,
  CommitmentScore,
  ScoreIssue,
  WeekScore,
} from "./types";

/**
 * 0–1 completion of one commitment. Doing more than the target is not
 * rewarded (spec §10: min(actual / target, 1)) — the score must not
 * encourage unnecessary volume or reward suffering (spec §3.2).
 */
export function commitmentCompletion(commitment: CommitmentInput): number {
  if (commitment.completionType === "boolean") {
    return commitment.actualValue >= 1 ? 1 : 0;
  }
  return Math.min(
    Math.max(commitment.actualValue, 0) / commitment.targetValue,
    1,
  );
}

/**
 * Week Score = Σ(commitment_completion × commitment_weight) × 100 over the
 * week's non-cancelled commitments (spec §10). Measures execution only; it
 * never reads metric values, and the Life Score never reads commitments.
 */
export function computeWeekScore(
  commitments: readonly CommitmentInput[],
): WeekScore {
  const ids = new Set<string>();
  for (const commitment of commitments) {
    if (ids.has(commitment.id)) {
      throw new ScoringInputError(`duplicate commitment id: ${commitment.id}`);
    }
    ids.add(commitment.id);
    if (!Number.isFinite(commitment.weight) || commitment.weight < 0) {
      throw new ScoringInputError(
        `invalid weight for commitment ${commitment.id}`,
      );
    }
    if (
      !Number.isFinite(commitment.targetValue) ||
      commitment.targetValue <= 0
    ) {
      throw new ScoringInputError(
        `invalid target for commitment ${commitment.id}`,
      );
    }
    if (!Number.isFinite(commitment.actualValue)) {
      throw new ScoringInputError(
        `invalid actual value for commitment ${commitment.id}`,
      );
    }
  }

  const counted = commitments.filter((c) => c.status !== "cancelled");
  const totalWeight = counted.reduce((sum, c) => sum + c.weight, 0);
  const issues: ScoreIssue[] = [];
  if (counted.length > 0 && totalWeight === 0)
    issues.push({ code: "no_weighted_items" });

  const scored: CommitmentScore[] = commitments.map((commitment) => {
    if (commitment.status === "cancelled") {
      return {
        ...commitment,
        completion: null,
        completed: false,
        weightShare: 0,
        contribution: 0,
      };
    }
    const completion = commitmentCompletion(commitment);
    const weightShare = totalWeight > 0 ? commitment.weight / totalWeight : 0;
    return {
      ...commitment,
      completion,
      completed: completion === 1,
      weightShare,
      contribution: completion * weightShare * 100,
    };
  });

  const completedCount = scored.filter((c) => c.completed).length;
  const score =
    totalWeight > 0
      ? Math.min(
          MAX_SCORE,
          Math.max(
            MIN_SCORE,
            scored.reduce((sum, c) => sum + c.contribution, 0),
          ),
        )
      : null;

  return {
    score,
    completedCount,
    totalCount: counted.length,
    executionRate: counted.length > 0 ? completedCount / counted.length : null,
    commitments: scored,
    issues,
  };
}
