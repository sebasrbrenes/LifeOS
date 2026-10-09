import { describe, expect, it } from "vitest";

import {
  describeTarget,
  formatMetricValue,
  parseValueForm,
  valueToInput,
} from "./values";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
}

const TODAY = "2026-10-07";
const number = { direction: "higher_is_better" as const };

describe("parseValueForm", () => {
  it("parses a value, date and note", () => {
    expect(
      parseValueForm(
        form({ value: "12,5", date: "2026-10-03", note: " buen día " }),
        number,
        TODAY,
      ),
    ).toEqual({
      ok: true,
      values: { value: 12.5, date: "2026-10-03", note: "buen día" },
    });
  });

  it("allows backdating but not the future", () => {
    expect(
      parseValueForm(form({ value: "1", date: "2025-01-01" }), number, TODAY)
        .ok,
    ).toBe(true);
    expect(
      parseValueForm(form({ value: "1", date: TODAY }), number, TODAY).ok,
    ).toBe(true);
    const future = parseValueForm(
      form({ value: "1", date: "2026-10-08" }),
      number,
      TODAY,
    );
    expect(!future.ok && future.fieldErrors.date).toBe(
      "No puedes registrar valores en el futuro.",
    );
  });

  it.each(["2026-02-30", "2026-13-01", "07/10/2026", "", "1899-12-31"])(
    "rejects invalid date %j",
    (date) => {
      const result = parseValueForm(form({ value: "1", date }), number, TODAY);
      expect(!result.ok && result.fieldErrors.date).toBeTruthy();
    },
  );

  it.each([
    ["", "Introduce un valor."],
    ["doce", "Introduce un número (p. ej. 7,5)."],
  ])("rejects value %j", (value, message) => {
    const result = parseValueForm(form({ value, date: TODAY }), number, TODAY);
    expect(!result.ok && result.fieldErrors.value).toBe(message);
  });

  it("only accepts 0 or 1 for yes/no metrics", () => {
    const boolean = { direction: "boolean" as const };
    expect(
      parseValueForm(form({ value: "1", date: TODAY }), boolean, TODAY).ok,
    ).toBe(true);
    const bad = parseValueForm(
      form({ value: "2", date: TODAY }),
      boolean,
      TODAY,
    );
    expect(!bad.ok && bad.fieldErrors.value).toBe("Elige Sí o No.");
  });

  it("stores percentages as fractions for ratio metrics", () => {
    const result = parseValueForm(
      form({ value: "8", date: TODAY }),
      { direction: "ratio" },
      TODAY,
    );
    expect(result.ok && result.values.value).toBe(0.08);
  });

  it("limits notes to 1000 characters", () => {
    const result = parseValueForm(
      form({ value: "1", date: TODAY, note: "x".repeat(1001) }),
      number,
      TODAY,
    );
    expect(!result.ok && result.fieldErrors.note).toBeTruthy();
  });
});

describe("formatMetricValue", () => {
  it.each([
    [
      12.5,
      { direction: "higher_is_better", unit: "km", config: {} },
      "12,5 km",
    ],
    [3, { direction: "higher_is_better", unit: null, config: {} }, "3"],
    [1, { direction: "boolean", unit: null, config: {} }, "Sí"],
    [0, { direction: "boolean", unit: null, config: {} }, "No"],
    [
      0.075,
      { direction: "ratio", unit: null, config: { target: 0.1 } },
      "7,5 %",
    ],
  ] as const)("%d → %s", (value, metric, text) => {
    expect(formatMetricValue(value, metric)).toBe(text);
  });

  it("shows the milestone reached", () => {
    const metric = {
      direction: "milestone" as const,
      unit: null,
      config: {
        milestones: [
          { value: 0, score: 0, label: "Inicio" },
          { value: 2, score: 60, label: "Portfolio" },
        ],
      },
    };
    expect(formatMetricValue(2, metric)).toBe("Portfolio");
    expect(formatMetricValue(1, metric)).toBe("Inicio");
  });
});

describe("valueToInput", () => {
  it("round-trips for edit fields", () => {
    expect(valueToInput(0.075, "ratio")).toBe("7.5");
    expect(valueToInput(12.5, "higher_is_better")).toBe("12.5");
  });
});

describe("describeTarget", () => {
  it.each([
    [
      { direction: "higher_is_better", unit: "km", config: { target: 15 } },
      "Objetivo: 15 km o más",
    ],
    [
      { direction: "lower_is_better", unit: "min", config: { target: 25 } },
      "Objetivo: 25 min o menos",
    ],
    [
      {
        direction: "target_range",
        unit: "h",
        config: { targetMin: 7, targetMax: 9 },
      },
      "Rango ideal: 7–9 h",
    ],
    [{ direction: "boolean", unit: null, config: {} }, "Objetivo: Sí"],
    [
      { direction: "ratio", unit: null, config: { target: 0.1 } },
      "Objetivo: 10 %",
    ],
    [
      { direction: "higher_is_better", unit: null, config: { target: -1 } },
      "Configuración no válida",
    ],
  ] as const)("%j", (metric, text) => {
    expect(describeTarget(metric)).toBe(text);
  });
});
