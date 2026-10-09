/** Spanish number and date formatting shared by the UI. */

const numberFormats = new Map<number, Intl.NumberFormat>();

export function formatNumber(value: number, maximumFractionDigits = 2): string {
  let format = numberFormats.get(maximumFractionDigits);
  if (!format) {
    format = new Intl.NumberFormat("es", { maximumFractionDigits });
    numberFormats.set(maximumFractionDigits, format);
  }
  // `+ 0` avoids rendering "-0".
  return format.format(value + 0);
}

/** 0–1 → "82 %". */
export function formatShare(share: number): string {
  return `${formatNumber(share * 100, 0)} %`;
}

/** Signed points, e.g. "+4,2" / "−1,3" (true minus sign). */
export function formatDelta(value: number): string {
  const formatted = formatNumber(Math.abs(value), 1);
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `−${formatted}`;
  return formatted;
}

/** Local YYYY-MM-DD → "6 oct 2026". */
export function formatLocalDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("es", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** Whole days between two local dates → "hoy", "ayer", "hace 5 días". */
export function formatDaysAgo(days: number): string {
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 60) return `hace ${days} días`;
  const months = Math.round(days / 30);
  if (months < 24) return `hace ${months} meses`;
  return `hace ${Math.round(days / 365)} años`;
}

/** "7,5" or "7.5" → 7.5; empty → null; anything else → NaN. */
export function parseDecimal(
  raw: FormDataEntryValue | null | undefined,
): number | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const normalized = trimmed.replace(/\s/g, "").replace(",", ".");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(normalized)) return Number.NaN;
  return Number(normalized);
}

/** Local week bounds → "28 sep – 4 oct 2026" (year once when shared). */
export function formatWeekRange(start: string, end: string): string {
  const format = (date: string, withYear: boolean) => {
    const [year, month, day] = date.split("-").map(Number);
    return new Intl.DateTimeFormat("es", {
      day: "numeric",
      month: "short",
      ...(withYear ? { year: "numeric" } : {}),
      timeZone: "UTC",
    }).format(new Date(Date.UTC(year, month - 1, day)));
  };
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${format(start, !sameYear)} – ${format(end, true)}`;
}
