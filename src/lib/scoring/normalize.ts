import type {
  MetricConfigByDirection,
  ParsedMetricConfig,
} from "./metric-config";

export const MIN_SCORE = 0;
export const MAX_SCORE = 100;

/**
 * Result of turning one value into a 0–100 score.
 *
 * `rawScore` is the formula's output before clamping; `capped` records when
 * clamping changed it, so overperformance is visible but never rewarded
 * beyond 100 (spec §3.2, §9.5).
 */
export type Normalized = {
  score: number;
  rawScore: number;
  capped: "above_max" | "below_min" | null;
  /** Direction-specific facts used by explanations. */
  detail: NormalizedDetail;
};

export type NormalizedDetail =
  | { kind: "linear"; from: number; to: number }
  | { kind: "inverse"; target: number }
  | {
      kind: "range";
      position: "below" | "inside" | "above";
      distance: number;
      tolerance: number;
    }
  | { kind: "boolean"; achieved: boolean }
  | {
      kind: "milestone";
      reached: { value: number; score: number; label: string } | null;
      next: { value: number; score: number; label: string } | null;
    }
  | { kind: "curve"; between: [number, number] | null };

export function clampScore(raw: number): Pick<Normalized, "score" | "capped"> {
  if (raw > MAX_SCORE) return { score: MAX_SCORE, capped: "above_max" };
  if (raw < MIN_SCORE) return { score: MIN_SCORE, capped: "below_min" };
  return { score: raw, capped: null };
}

function result(rawScore: number, detail: NormalizedDetail): Normalized {
  // `+ 0` turns -0 (e.g. 0 / -10000) into 0 so it never renders as "-0".
  const raw = rawScore + 0;
  return { rawScore: raw, detail, ...clampScore(raw) };
}

/** Linear between `from` (score 0) and `to` (score 100). */
function linear(value: number, from: number, to: number): Normalized {
  return result(((value - from) / (to - from)) * 100, {
    kind: "linear",
    from,
    to,
  });
}

export function scoreHigherIsBetter(
  value: number,
  config: MetricConfigByDirection["higher_is_better"],
): Normalized {
  return linear(value, config.baseline, config.target);
}

export function scoreLowerIsBetter(
  value: number,
  config: MetricConfigByDirection["lower_is_better"],
): Normalized {
  if (config.worst !== undefined) {
    return linear(value, config.worst, config.target);
  }
  // Spec §9.2: target / value. At or below zero the target is beaten.
  const raw = value <= 0 ? MAX_SCORE : (config.target / value) * 100;
  return result(raw, { kind: "inverse", target: config.target });
}

export function scoreTargetRange(
  value: number,
  config: MetricConfigByDirection["target_range"],
): Normalized {
  const width = config.targetMax - config.targetMin;
  const fallback = config.tolerance ?? width;
  if (value < config.targetMin) {
    const tolerance = config.toleranceBelow ?? fallback;
    const distance = config.targetMin - value;
    return result(100 * (1 - distance / tolerance), {
      kind: "range",
      position: "below",
      distance,
      tolerance,
    });
  }
  if (value > config.targetMax) {
    const tolerance = config.toleranceAbove ?? fallback;
    const distance = value - config.targetMax;
    return result(100 * (1 - distance / tolerance), {
      kind: "range",
      position: "above",
      distance,
      tolerance,
    });
  }
  return result(MAX_SCORE, {
    kind: "range",
    position: "inside",
    distance: 0,
    tolerance: fallback,
  });
}

export function scoreBoolean(value: number): Normalized {
  const achieved = value > 0;
  return result(achieved ? MAX_SCORE : MIN_SCORE, {
    kind: "boolean",
    achieved,
  });
}

export function scoreMilestone(
  value: number,
  config: MetricConfigByDirection["milestone"],
): Normalized {
  let reachedIndex = -1;
  config.milestones.forEach((milestone, index) => {
    if (value >= milestone.value) reachedIndex = index;
  });
  const reached = reachedIndex >= 0 ? config.milestones[reachedIndex] : null;
  const next = config.milestones[reachedIndex + 1] ?? null;
  return result(reached?.score ?? MIN_SCORE, {
    kind: "milestone",
    reached,
    next,
  });
}

export function scoreRatio(
  ratio: number,
  config: MetricConfigByDirection["ratio"],
): Normalized {
  return linear(ratio, 0, config.target);
}

export function scoreCustom(
  value: number,
  config: MetricConfigByDirection["custom"],
): Normalized {
  const { points } = config;
  const first = points[0];
  const last = points[points.length - 1];
  if (value <= first.value)
    return result(first.score, { kind: "curve", between: null });
  if (value >= last.value)
    return result(last.score, { kind: "curve", between: null });

  const upper = points.findIndex((point) => point.value >= value);
  const a = points[upper - 1];
  const b = points[upper];
  const t = (value - a.value) / (b.value - a.value);
  return result(a.score + t * (b.score - a.score), {
    kind: "curve",
    between: [a.value, b.value],
  });
}

/** Scores a value according to a parsed metric config. */
export function normalize(
  value: number,
  parsed: ParsedMetricConfig,
): Normalized {
  switch (parsed.direction) {
    case "higher_is_better":
      return scoreHigherIsBetter(value, parsed.config);
    case "lower_is_better":
      return scoreLowerIsBetter(value, parsed.config);
    case "target_range":
      return scoreTargetRange(value, parsed.config);
    case "boolean":
      return scoreBoolean(value);
    case "milestone":
      return scoreMilestone(value, parsed.config);
    case "ratio":
      return scoreRatio(value, parsed.config);
    case "custom":
      return scoreCustom(value, parsed.config);
  }
}
