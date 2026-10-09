import { describe, expect, it } from "vitest";

import { diagnosticCopy } from "./copy";

const base = {
  categoryId: "c",
  categoryName: "Business",
  execution: 88.4,
  outcomeChange: 0.3,
  weeks: 4,
};

describe("diagnosticCopy", () => {
  it("explains high execution with little outcome, with its numbers", () => {
    const copy = diagnosticCopy({
      ...base,
      code: "high_execution_low_outcome",
    });
    expect(copy.title).toBe("Business: buena ejecución, poco resultado");
    expect(copy.body).toContain("88 %");
    expect(copy.body).toContain("+0,3 pts");
    expect(copy.body).toContain("4 semanas");
  });

  it("explains an execution bottleneck", () => {
    const copy = diagnosticCopy({
      ...base,
      code: "execution_bottleneck",
      execution: 35,
      outcomeChange: -2,
    });
    expect(copy.title).toContain("cuello de botella");
    expect(copy.body).toContain("35 %");
    expect(copy.body).toContain("−2 pts");
  });
});
