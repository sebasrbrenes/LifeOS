import { describe, expect, it } from "vitest";

import { focusCopy } from "./review-copy";

describe("focusCopy", () => {
  it("explains each focus with its numbers", () => {
    expect(focusCopy({ kind: "execution", weekScore: 42.4 })).toContain(
      "Week Score 42",
    );
    expect(
      focusCopy({
        kind: "metric",
        gap: {
          metricId: "m",
          key: "savings",
          name: "Ahorro",
          categoryName: "Money",
          score: 60,
          potentialGain: 6,
        },
      }),
    ).toBe(
      "Prioriza «Ahorro» (Money): está en 60/100 y llevarla a su objetivo sumaría +6 pts al Life Score.",
    );
    expect(focusCopy({ kind: "plan_commitments" })).toMatch(/compromisos/);
    expect(focusCopy({ kind: "collect_data" })).toMatch(/Registra/);
    expect(focusCopy(null)).toMatch(/objetivo/);
  });
});
