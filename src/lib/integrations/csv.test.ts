import { describe, expect, it } from "vitest";

import {
  CSV_MAX_ROWS,
  csvRecordId,
  parseCsvDate,
  parseValuesCsv,
  splitCsvLine,
} from "./csv";

const TODAY = "2026-10-07";

describe("splitCsvLine", () => {
  it("honours quotes and escaped quotes", () => {
    expect(splitCsvLine('2026-10-01,"7,5","dijo ""hola"""', ",")).toEqual([
      "2026-10-01",
      "7,5",
      'dijo "hola"',
    ]);
    expect(splitCsvLine("a; b ;c", ";")).toEqual(["a", "b", "c"]);
  });
});

describe("parseCsvDate", () => {
  it("reads ISO and day-first dates", () => {
    expect(parseCsvDate("2026-10-01")).toBe("2026-10-01");
    expect(parseCsvDate("1/10/2026")).toBe("2026-10-01");
    expect(parseCsvDate("01.10.2026")).toBe("2026-10-01");
  });

  it("rejects impossible or ambiguous input", () => {
    expect(parseCsvDate("2026-02-30")).toBeNull();
    expect(parseCsvDate("10/01/26")).toBeNull();
    expect(parseCsvDate("fecha")).toBeNull();
  });
});

describe("parseValuesCsv", () => {
  it("parses a Spanish spreadsheet export with header and notes", () => {
    const csv =
      "\uFEFFfecha;valor;nota\r\n2026-10-01;7,5;buen día\r\n02/10/2026;8;\r\n";
    expect(parseValuesCsv(csv, "higher_is_better", TODAY)).toEqual({
      ok: true,
      rows: [
        { line: 2, date: "2026-10-01", value: 7.5, note: "buen día" },
        { line: 3, date: "2026-10-02", value: 8, note: null },
      ],
    });
  });

  it("works without a header and with commas", () => {
    const result = parseValuesCsv(
      '2026-10-01,"1,5"\n2026-10-02,2.25',
      "higher_is_better",
      TODAY,
    );
    expect(result).toMatchObject({
      ok: true,
      rows: [{ value: 1.5 }, { value: 2.25 }],
    });
  });

  it("converts yes/no and percentages like the value form", () => {
    expect(
      parseValuesCsv("2026-10-01;sí\n2026-10-02;No", "boolean", TODAY),
    ).toMatchObject({ ok: true, rows: [{ value: 1 }, { value: 0 }] });
    expect(parseValuesCsv("2026-10-01;45%", "ratio", TODAY)).toMatchObject({
      ok: true,
      rows: [{ value: 0.45 }],
    });
  });

  it("is all-or-nothing and reports each bad line", () => {
    const result = parseValuesCsv(
      [
        "fecha,valor",
        "2026-10-01,5",
        "2026-13-01,5",
        "2026-10-02,abc",
        "2026-12-01,3",
        "2026-10-01,5",
        "2026-10-03,",
      ].join("\n"),
      "higher_is_better",
      TODAY,
    );
    expect(result).toEqual({
      ok: false,
      errors: [
        { line: 3, message: "fecha no válida «2026-13-01»" },
        { line: 4, message: "no es un número" },
        { line: 5, message: "la fecha está en el futuro" },
        { line: 6, message: "repite la línea 2" },
        { line: 7, message: "falta el valor" },
      ],
    });
  });

  it("rejects empty files and files over the row limit", () => {
    expect(parseValuesCsv("\n\n", "higher_is_better", TODAY).ok).toBe(false);
    expect(parseValuesCsv("fecha;valor\n", "higher_is_better", TODAY).ok).toBe(
      false,
    );
    const big = Array.from(
      { length: CSV_MAX_ROWS + 1 },
      (_, i) => `2020-01-01;${i}`,
    ).join("\n");
    expect(parseValuesCsv(big, "higher_is_better", TODAY)).toMatchObject({
      ok: false,
      errors: [{ message: `Máximo ${CSV_MAX_ROWS} filas por archivo.` }],
    });
  });
});

describe("csvRecordId", () => {
  it("is stable for the same date and value", () => {
    expect(csvRecordId({ date: "2026-10-01", value: 7.5 })).toBe(
      "csv:2026-10-01:7.5",
    );
  });
});
