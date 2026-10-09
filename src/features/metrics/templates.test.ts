import { describe, expect, it } from "vitest";

import { parseMetricConfig } from "@/lib/scoring";

import { slugifyMetricKey } from "./metric-key";
import { METRIC_TEMPLATES } from "./templates";

describe("METRIC_TEMPLATES", () => {
  it.each(METRIC_TEMPLATES.map((t) => [t.id, t] as const))(
    "%s has a config the engine accepts",
    (_id, template) => {
      expect(
        parseMetricConfig(template.direction, template.config),
      ).toMatchObject({ ok: true });
    },
  );

  it("covers all six default categories", () => {
    expect(new Set(METRIC_TEMPLATES.map((t) => t.categoryKey))).toEqual(
      new Set(["career", "business", "body", "money", "discipline", "life"]),
    );
  });

  it("has unique ids and names", () => {
    expect(new Set(METRIC_TEMPLATES.map((t) => t.id)).size).toBe(
      METRIC_TEMPLATES.length,
    );
    expect(
      new Set(METRIC_TEMPLATES.map((t) => slugifyMetricKey(t.name))).size,
    ).toBe(METRIC_TEMPLATES.length);
  });

  it("stays small (spec §44: start with ~20–25 metrics, not 100)", () => {
    expect(METRIC_TEMPLATES.length).toBeLessThanOrEqual(25);
  });
});
