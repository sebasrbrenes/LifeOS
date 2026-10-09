import { describe, expect, it } from "vitest";

import { describeIssue } from "./issue-copy";
import { toCommitmentInput, toEventInput, toMetricInput } from "./mappers";

const metricRow = {
  id: "m1",
  key: "running_km",
  name: "Distancia",
  description: null,
  category_id: "c1",
  direction: "higher_is_better",
  period: "weekly",
  aggregation: "sum",
  weight: 2,
  enabled: true,
  source_preference: "manual",
  config: { target: 15 },
  unit: "km",
  position: 0,
};

describe("mappers", () => {
  it("maps a metric row to engine input", () => {
    expect(toMetricInput(metricRow)).toEqual({
      id: "m1",
      key: "running_km",
      name: "Distancia",
      categoryId: "c1",
      direction: "higher_is_better",
      period: "weekly",
      aggregation: "sum",
      weight: 2,
      enabled: true,
      sourcePreference: "manual",
      config: { target: 15 },
      unit: "km",
    });
  });

  it("fails loudly on vocabulary the engine doesn't know", () => {
    expect(() =>
      toMetricInput({ ...metricRow, direction: "sideways" }),
    ).toThrow("Unknown direction: sideways");
  });

  it("parses timestamps and numeric strings", () => {
    const event = toEventInput({
      id: "e1",
      metric_definition_id: "m1",
      occurred_at: "2026-10-06T12:00:00+00:00",
      value_numeric: "12.5" as unknown as number,
      source: "strava",
      external_record_id: "a1",
      confidence: "0.9" as unknown as number,
    });
    expect(event.occurredAt.toISOString()).toBe("2026-10-06T12:00:00.000Z");
    expect(event.value).toBe(12.5);
    expect(event.confidence).toBe(0.9);
  });

  it("keeps null values null (missing is not zero)", () => {
    expect(
      toEventInput({
        id: "e1",
        metric_definition_id: "m1",
        occurred_at: "2026-10-06T12:00:00Z",
        value_numeric: null,
        source: "manual",
        external_record_id: null,
        confidence: 1,
      }).value,
    ).toBeNull();
  });

  it("maps commitments", () => {
    expect(
      toCommitmentInput({
        id: "w1",
        title: "3 runs",
        category_id: null,
        target_value: 3,
        actual_value: 2,
        weight: 1,
        completion_type: "quantity",
        status: "active",
        unit: "runs",
      }),
    ).toMatchObject({
      targetValue: 3,
      actualValue: 2,
      completionType: "quantity",
    });
  });
});

describe("describeIssue", () => {
  it("explains issues in Spanish", () => {
    expect(
      describeIssue({ code: "source_unavailable", source: "strava" }).text,
    ).toBe(
      "Strava no está disponible; la métrica queda sin datos en vez de contar como 0.",
    );
    expect(
      describeIssue({ code: "dominant_metric", metricKey: "x", share: 0.75 }),
    ).toEqual({
      tone: "warning",
      text: "Una métrica concentra el 75 % del peso de la categoría.",
    });
  });
});
