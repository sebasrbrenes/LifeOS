import { PERIOD_WINDOW_DAYS, type MetricPeriod } from "./vocabulary";

/** A calendar date in the user's timezone, formatted YYYY-MM-DD. */
export type LocalDate = string;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatterFor(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** The local calendar date of an instant in `timeZone` (spec FR-002). */
export function localDate(instant: Date, timeZone: string): LocalDate {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Adds whole days to a local date (calendar arithmetic, DST-safe). */
export function addDays(date: LocalDate, days: number): LocalDate {
  const [year, month, day] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return utc.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  const toUtc = (date: LocalDate) => {
    const [year, month, day] = date.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
}

/** Inclusive range of local dates; `from: null` means "all history". */
export type DateWindow = { from: LocalDate | null; to: LocalDate };

/**
 * Trailing evaluation window for a metric period, ending on the local date
 * of `asOf` (inclusive). A weekly metric on any day covers that day and the
 * six before it — a rolling window, so state scores don't collapse at the
 * start of each calendar week.
 */
export function evaluationWindow(
  period: MetricPeriod,
  asOf: Date,
  timeZone: string,
): DateWindow {
  const to = localDate(asOf, timeZone);
  const days = PERIOD_WINDOW_DAYS[period];
  return { from: days === null ? null : addDays(to, -(days - 1)), to };
}

export function isWithinWindow(date: LocalDate, window: DateWindow): boolean {
  return (window.from === null || date >= window.from) && date <= window.to;
}

/** 0 = Sunday … 6 = Saturday (profiles.week_starts_on). */
export function dayOfWeek(date: LocalDate): number {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** First local date of the calendar week containing `date`. */
export function startOfWeek(date: LocalDate, weekStartsOn: number): LocalDate {
  const offset = (dayOfWeek(date) - weekStartsOn + 7) % 7;
  return addDays(date, -offset);
}

/** Minutes `timeZone` is ahead of UTC at `instant`. */
function timeZoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return Math.round(
    (asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000,
  );
}

/**
 * The instant to store for a value the user dated `date` (local). Today
 * maps to `now`, so a value entered in the morning isn't in the future
 * (future events are ignored by the engine). Past dates map to local noon,
 * far from midnight and DST switches, so the event stays on that date.
 */
export function localDateToInstant(
  date: LocalDate,
  timeZone: string,
  now: Date,
): Date {
  if (date === localDate(now, timeZone)) return now;
  const [year, month, day] = date.split("-").map(Number);
  const noonUtc = Date.UTC(year, month - 1, day, 12);
  const offset = timeZoneOffsetMinutes(new Date(noonUtc), timeZone);
  return new Date(noonUtc - offset * 60_000);
}

/**
 * The first instant of a local date in `timeZone`. Handles DST, including
 * zones whose clocks jump at midnight (the day then starts at 01:00).
 */
export function startOfLocalDay(date: LocalDate, timeZone: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const utcMidnight = Date.UTC(year, month - 1, day);
  let instant =
    utcMidnight -
    timeZoneOffsetMinutes(new Date(utcMidnight), timeZone) * 60_000;
  // The offset at local midnight can differ from the one at UTC midnight.
  instant =
    utcMidnight - timeZoneOffsetMinutes(new Date(instant), timeZone) * 60_000;
  // Midnight skipped by DST: move to the first instant that is on `date`.
  for (let step = 0; step < 8; step += 1) {
    if (localDate(new Date(instant), timeZone) >= date) break;
    instant += 15 * 60_000;
  }
  return new Date(instant);
}

/** The last millisecond of a local date in `timeZone`. */
export function endOfLocalDay(date: LocalDate, timeZone: string): Date {
  return new Date(startOfLocalDay(addDays(date, 1), timeZone).getTime() - 1);
}

/** Last local date of the week that starts on `weekStart`. */
export function endOfWeek(weekStart: LocalDate): LocalDate {
  return addDays(weekStart, 6);
}
