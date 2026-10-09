import { addDays, type LocalDate } from "@/lib/scoring";

import { parseLocalDate } from "../week/period";

export const HISTORY_RANGES = [30, 90, 180, 365] as const;
export type HistoryRange = (typeof HISTORY_RANGES)[number];
export const DEFAULT_RANGE: HistoryRange = 90;
/** Chart points per range; longer ranges are sampled evenly. */
export const MAX_CHART_POINTS = 120;

export function parseRange(raw: unknown): HistoryRange {
  const value = typeof raw === "string" ? Number(raw) : NaN;
  return HISTORY_RANGES.find((range) => range === value) ?? DEFAULT_RANGE;
}

/**
 * The two dates of "You vs You". Defaults to 90 days ago vs today; dates
 * after today are clamped to today and the pair is ordered.
 */
export function parseComparison(
  rawFrom: unknown,
  rawTo: unknown,
  today: LocalDate,
): { from: LocalDate; to: LocalDate } {
  const clamp = (date: LocalDate | null, fallback: LocalDate) =>
    date === null ? fallback : date > today ? today : date;
  const from = clamp(parseLocalDate(rawFrom), addDays(today, -90));
  const to = clamp(parseLocalDate(rawTo), today);
  return from <= to ? { from, to } : { from: to, to: from };
}
