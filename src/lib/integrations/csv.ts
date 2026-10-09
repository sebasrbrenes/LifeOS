import { parseDecimal } from "@/lib/format";
import type { LocalDate, MetricDirection } from "@/lib/scoring";

/**
 * CSV import (spec §15 "CsvImportAdapter"): a user's own spreadsheet of
 * dated values for one metric. Pure parsing and validation; nothing here
 * touches the database.
 *
 * Accepted shape — one value per row, optional header and note column:
 *
 *   fecha;valor;nota            date,value,note
 *   2026-10-01;7,5;buen día     01/10/2026,"7,5",
 *
 * Delimiter: comma, semicolon or tab (detected). Dates: YYYY-MM-DD or
 * DD/MM/YYYY. Decimal comma or point.
 */

export const CSV_MAX_ROWS = 5000;
/** Under the 1 MB Server Action body limit, with room for form overhead. */
export const CSV_MAX_BYTES = 900_000;

export type CsvRow = {
  /** 1-based line number in the file, for error messages. */
  line: number;
  date: LocalDate;
  value: number;
  note: string | null;
};

export type CsvError = { line: number; message: string };

export type CsvParseResult =
  { ok: true; rows: CsvRow[] } | { ok: false; errors: CsvError[] };

function detectDelimiter(firstLine: string): string {
  const counts = [";", "\t", ","].map((delimiter) => ({
    delimiter,
    count: firstLine.split(delimiter).length - 1,
  }));
  return counts.sort((a, b) => b.count - a.count)[0].count > 0
    ? counts[0].delimiter
    : ",";
}

/** Splits one line, honouring double quotes ("a,b" and "" escapes). */
export function splitCsvLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"' && current.trim() === "") {
      quoted = true;
      current = "";
    } else if (char === delimiter) {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

function isRealDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    year >= 1900
  );
}

/** YYYY-MM-DD or DD/MM/YYYY (also with "-" or "."), else null. */
export function parseCsvDate(raw: string): LocalDate | null {
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  const european = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(raw);
  const [year, month, day] = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : european
      ? [Number(european[3]), Number(european[2]), Number(european[1])]
      : [NaN, NaN, NaN];
  if (!isRealDate(year, month, day)) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const TRUE_WORDS = new Set(["1", "si", "sí", "yes", "true", "verdadero", "x"]);
const FALSE_WORDS = new Set(["0", "no", "false", "falso"]);

function parseValue(
  raw: string,
  direction: MetricDirection,
): { value: number } | { error: string } {
  if (direction === "boolean") {
    const word = raw.trim().toLowerCase();
    if (TRUE_WORDS.has(word)) return { value: 1 };
    if (FALSE_WORDS.has(word)) return { value: 0 };
    return { error: "usa sí/no o 1/0" };
  }
  const value = parseDecimal(raw.replace(/%$/, "").trim());
  if (value === null) return { error: "falta el valor" };
  if (!Number.isFinite(value)) return { error: "no es un número" };
  // Ratio metrics are entered as percentages, like in the value form.
  return { value: direction === "ratio" ? value / 100 : value };
}

/**
 * Parses and validates a whole file. All-or-nothing: any invalid row
 * makes the result an error list (first 20), so a file is never half
 * imported.
 */
export function parseValuesCsv(
  text: string,
  direction: MetricDirection,
  today: LocalDate,
): CsvParseResult {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r\n|\n|\r/)
    .map((content, index) => ({ content, line: index + 1 }))
    .filter(({ content }) => content.trim() !== "");
  if (lines.length === 0)
    return {
      ok: false,
      errors: [{ line: 0, message: "El archivo está vacío." }],
    };

  const delimiter = detectDelimiter(lines[0].content);
  const firstFields = splitCsvLine(lines[0].content, delimiter);
  const hasHeader =
    parseCsvDate(firstFields[0] ?? "") === null &&
    /[a-záéíóúñ]/i.test(firstFields[0] ?? "");
  const data = hasHeader ? lines.slice(1) : lines;

  if (data.length === 0)
    return {
      ok: false,
      errors: [{ line: 0, message: "No hay filas con datos." }],
    };
  if (data.length > CSV_MAX_ROWS)
    return {
      ok: false,
      errors: [
        { line: 0, message: `Máximo ${CSV_MAX_ROWS} filas por archivo.` },
      ],
    };

  const rows: CsvRow[] = [];
  const errors: CsvError[] = [];
  const seen = new Map<string, number>();
  for (const { content, line } of data) {
    const [rawDate = "", rawValue = "", rawNote = ""] = splitCsvLine(
      content,
      delimiter,
    );
    const date = parseCsvDate(rawDate);
    if (!date) {
      errors.push({
        line,
        message: `fecha no válida «${rawDate.slice(0, 20)}»`,
      });
      continue;
    }
    if (date > today) {
      errors.push({ line, message: "la fecha está en el futuro" });
      continue;
    }
    const value = parseValue(rawValue, direction);
    if ("error" in value) {
      errors.push({ line, message: value.error });
      continue;
    }
    const note = rawNote.trim().slice(0, 1000) || null;
    const key = `${date}|${value.value}`;
    const previous = seen.get(key);
    if (previous !== undefined) {
      errors.push({ line, message: `repite la línea ${previous}` });
      continue;
    }
    seen.set(key, line);
    rows.push({ line, date, value: value.value, note });
  }

  return errors.length > 0
    ? { ok: false, errors: errors.slice(0, 20) }
    : { ok: true, rows };
}

/**
 * Stable identity of an imported value: re-importing the same file adds
 * nothing (the database's unique external-record index enforces it).
 */
export function csvRecordId(row: Pick<CsvRow, "date" | "value">): string {
  return `csv:${row.date}:${row.value}`;
}
