import { describe, expect, it } from "vitest";

import { describeSeries } from "./describe";

describe("describeSeries", () => {
  it("summarises first, last, min and max, ignoring gaps", () => {
    expect(describeSeries("Life Score", [null, 40.9, 61.2, 55, null])).toBe(
      "Life Score: de 40 a 55, mínimo 40, máximo 61.",
    );
  });

  it("says when there is no data", () => {
    expect(describeSeries("Body", [null, null])).toBe(
      "Body: sin datos en este periodo.",
    );
  });
});
