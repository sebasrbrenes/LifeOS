import { describe, expect, it } from "vitest";

import { parseMetricConfig } from "@/lib/scoring";

import { metricFormDefaults, parseMetricForm } from "./metric-form";

const CATEGORY = "11111111-1111-4111-8111-111111111111";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
}

const base = {
  name: "Distancia corriendo",
  categoryId: CATEGORY,
  unit: "km",
  direction: "higher_is_better",
  period: "weekly",
  aggregation: "sum",
  weight: "1",
};

describe("parseMetricForm", () => {
  it("builds a definition and config", () => {
    const result = parseMetricForm(form({ ...base, target: "15" }));
    expect(result).toEqual({
      ok: true,
      values: {
        name: "Distancia corriendo",
        categoryId: CATEGORY,
        description: null,
        unit: "km",
        direction: "higher_is_better",
        period: "weekly",
        aggregation: "sum",
        weight: 1,
        config: { target: 15 },
      },
    });
  });

  it("accepts decimal commas", () => {
    const result = parseMetricForm(
      form({
        ...base,
        direction: "target_range",
        aggregation: "avg",
        targetMin: "7",
        targetMax: "8,5",
      }),
    );
    expect(result.ok && result.values.config).toEqual({
      targetMin: 7,
      targetMax: 8.5,
    });
  });

  it("produces configs the score engine accepts", () => {
    const cases: Record<string, string>[] = [
      { ...base, target: "15", baseline: "2" },
      { ...base, direction: "lower_is_better", target: "25" },
      { ...base, direction: "lower_is_better", target: "0", worst: "10000" },
      {
        ...base,
        direction: "target_range",
        targetMin: "7",
        targetMax: "9",
        tolerance: "1",
      },
      { ...base, direction: "boolean" },
      { ...base, direction: "ratio", ratioTarget: "10" },
      {
        ...base,
        direction: "milestone",
        "milestones.0.value": "0",
        "milestones.0.score": "0",
        "milestones.0.label": "Sin camino",
        "milestones.1.value": "1",
        "milestones.1.score": "40",
        "milestones.1.label": "Formación",
      },
      {
        ...base,
        direction: "custom",
        "points.0.value": "0",
        "points.0.score": "0",
        "points.1.value": "10",
        "points.1.score": "100",
      },
    ];
    for (const values of cases) {
      const result = parseMetricForm(form(values));
      expect(result.ok, JSON.stringify(values)).toBe(true);
      if (result.ok) {
        expect(
          parseMetricConfig(result.values.direction, result.values.config).ok,
        ).toBe(true);
      }
    }
  });

  it("stores ratio targets as fractions from a percentage field", () => {
    const result = parseMetricForm(
      form({
        ...base,
        direction: "ratio",
        ratioTarget: "12,5",
        numerator: "replies",
        denominator: "contacted",
        minDenominator: "20",
      }),
    );
    expect(result.ok && result.values.config).toEqual({
      target: 0.125,
      numerator: "replies",
      denominator: "contacted",
      minDenominator: 20,
    });
  });

  it("keeps the empty-window override", () => {
    const result = parseMetricForm(
      form({ ...base, target: "15", emptyWindow: "missing" }),
    );
    expect(result.ok && result.values.config).toEqual({
      target: 15,
      emptyWindow: "missing",
    });
  });

  it("orders milestone rows by index and skips blank rows", () => {
    const result = parseMetricForm(
      form({
        ...base,
        direction: "milestone",
        "milestones.2.value": "2",
        "milestones.2.score": "80",
        "milestones.2.label": "Oferta",
        "milestones.0.value": "0",
        "milestones.0.score": "0",
        "milestones.0.label": "Inicio",
        "milestones.1.value": "",
        "milestones.1.score": "",
        "milestones.1.label": "",
      }),
    );
    expect(result.ok && result.values.config).toEqual({
      milestones: [
        { value: 0, score: 0, label: "Inicio" },
        { value: 2, score: 80, label: "Oferta" },
      ],
    });
  });

  describe("errors in Spanish, on the right field", () => {
    it.each([
      [{ name: "" }, "name", "Ponle un nombre."],
      [{ categoryId: "nope" }, "categoryId", "Elige una categoría."],
      [{ target: "" }, "target", "Este campo es obligatorio."],
      [{ target: "quince" }, "target", "Introduce un número (p. ej. 7,5)."],
      [{ weight: "150" }, "weight", "No puede superar 100."],
      [
        { target: "10", baseline: "20" },
        "target",
        "El objetivo debe ser mayor que el valor base.",
      ],
    ])("%j → %s", (overrides, field, message) => {
      const result = parseMetricForm(
        form({ ...base, target: "15", ...overrides }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.fieldErrors[field]).toBe(message);
    });

    it("maps engine range errors", () => {
      const result = parseMetricForm(
        form({
          ...base,
          direction: "target_range",
          targetMin: "9",
          targetMax: "7",
        }),
      );
      expect(!result.ok && result.fieldErrors.targetMax).toBe(
        "El máximo debe ser mayor o igual que el mínimo.",
      );
    });

    it("maps ratio target errors to the percentage field", () => {
      const result = parseMetricForm(
        form({ ...base, direction: "ratio", ratioTarget: "0" }),
      );
      expect(!result.ok && result.fieldErrors.ratioTarget).toBeDefined();
    });

    it("validates milestone rows", () => {
      const missing = parseMetricForm(
        form({ ...base, direction: "milestone" }),
      );
      expect(!missing.ok && missing.fieldErrors.milestones).toBe(
        "Añade al menos un nivel.",
      );

      const incomplete = parseMetricForm(
        form({
          ...base,
          direction: "milestone",
          "milestones.0.value": "1",
          "milestones.0.score": "",
        }),
      );
      expect(!incomplete.ok && incomplete.fieldErrors.milestones).toMatch(
        /Completa el nivel 1/,
      );

      const unordered = parseMetricForm(
        form({
          ...base,
          direction: "milestone",
          "milestones.0.value": "2",
          "milestones.0.score": "10",
          "milestones.0.label": "a",
          "milestones.1.value": "1",
          "milestones.1.score": "20",
          "milestones.1.label": "b",
        }),
      );
      expect(!unordered.ok && unordered.fieldErrors.milestones).toBe(
        "Los valores de los niveles deben ser distintos y de menor a mayor.",
      );
    });
  });
});

describe("metricFormDefaults", () => {
  it("round-trips a config into form fields", () => {
    expect(
      metricFormDefaults({
        direction: "target_range",
        config: { targetMin: 7, targetMax: 9, emptyWindow: "zero" },
      }),
    ).toMatchObject({
      targetMin: "7",
      targetMax: "9",
      tolerance: "",
      emptyWindow: "zero",
    });
  });

  it("shows ratio targets as percentages", () => {
    expect(
      metricFormDefaults({ direction: "ratio", config: { target: 0.07 } }),
    ).toMatchObject({
      ratioTarget: "7",
      target: "",
    });
  });
});
