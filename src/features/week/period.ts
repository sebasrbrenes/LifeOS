import {
  addDays,
  endOfLocalDay,
  endOfWeek,
  startOfLocalDay,
  startOfWeek,
  type LocalDate,
} from "@/lib/scoring";

/** How far ahead weeks can be planned. */
export const MAX_WEEKS_AHEAD = 4;

export type WeekPhase = "past" | "current" | "future";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date in YYYY-MM-DD form, or null. */
export function parseLocalDate(raw: unknown): LocalDate | null {
  if (typeof raw !== "string" || !DATE_PATTERN.test(raw)) return null;
  const [year, month, day] = raw.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day &&
    raw >= "2000-01-01"
    ? raw
    : null;
}

export function weekPhase(weekStart: LocalDate, today: LocalDate): WeekPhase {
  if (weekStart > today) return "future";
  return endOfWeek(weekStart) < today ? "past" : "current";
}

/** A week can be closed (reviewed) from its last day on. */
export function isClosable(weekStart: LocalDate, today: LocalDate): boolean {
  return endOfWeek(weekStart) <= today;
}

/** Commitments can be added to the current week and a few ahead, not the past. */
export function canPlanWeek(
  weekStart: LocalDate,
  currentWeekStart: LocalDate,
): boolean {
  return (
    weekStart >= currentWeekStart &&
    weekStart <= addDays(currentWeekStart, 7 * MAX_WEEKS_AHEAD)
  );
}

/** Progress is logged once a week has started (late logging allowed). */
export function canTrackProgress(
  weekStart: LocalDate,
  today: LocalDate,
): boolean {
  return weekStart <= today;
}

/**
 * The week to show for a `?w=` value: any date inside a week selects that
 * week (per the user's week start); anything else, the current week.
 */
export function resolveWeekStart(
  raw: unknown,
  weekStartsOn: number,
  today: LocalDate,
): LocalDate {
  const date = parseLocalDate(raw);
  return startOfWeek(date ?? today, weekStartsOn);
}

/**
 * The instants a weekly review compares: the end of the day before the
 * week, and the end of its last day — or now, when closing on that day.
 */
export function reviewInstants(
  weekStart: LocalDate,
  timeZone: string,
  now: Date,
): { start: Date; end: Date } {
  const start = new Date(startOfLocalDay(weekStart, timeZone).getTime() - 1);
  const lastInstant = endOfLocalDay(endOfWeek(weekStart), timeZone);
  return { start, end: lastInstant < now ? lastInstant : now };
}
