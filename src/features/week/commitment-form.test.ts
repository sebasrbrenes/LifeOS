import { describe, expect, it } from "vitest";

import { parseCommitmentForm, parseProgress } from "./commitment-form";

const CATEGORY = "11111111-1111-4111-8111-111111111111";
const own = new Set([CATEGORY]);

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("parseCommitmentForm", () => {
  it("parses a quantity commitment", () => {
    expect(
      parseCommitmentForm(
        form({
          title: "  Salir a correr ",
          categoryId: CATEGORY,
          completionType: "quantity",
          targetValue: "3",
          unit: "salidas",
          weight: "2",
        }),
        own,
      ),
    ).toEqual({
      ok: true,
      values: {
        title: "Salir a correr",
        categoryId: CATEGORY,
        completionType: "quantity",
        targetValue: 3,
        unit: "salidas",
        weight: 2,
      },
    });
  });

  it("accepts decimal commas and defaults the weight to 1", () => {
    const result = parseCommitmentForm(
      form({ title: "Km", completionType: "quantity", targetValue: "7,5" }),
      own,
    );
    expect(result).toMatchObject({
      ok: true,
      values: { targetValue: 7.5, weight: 1, categoryId: null, unit: null },
    });
  });

  it("forces boolean commitments to target 1 without unit", () => {
    const result = parseCommitmentForm(
      form({
        title: "Revisión semanal",
        completionType: "boolean",
        targetValue: "5",
        unit: "x",
      }),
      own,
    );
    expect(result).toMatchObject({
      ok: true,
      values: { completionType: "boolean", targetValue: 1, unit: null },
    });
  });

  it("reports every invalid field", () => {
    const result = parseCommitmentForm(
      form({
        title: "",
        categoryId: "22222222-2222-4222-8222-222222222222",
        completionType: "quantity",
        targetValue: "0",
        weight: "abc",
      }),
      own,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.fieldErrors).sort()).toEqual([
      "categoryId",
      "targetValue",
      "title",
      "weight",
    ]);
  });

  it("rejects unknown types, missing targets and zero weight", () => {
    const bad = parseCommitmentForm(
      form({ title: "x", completionType: "streak" }),
      own,
    );
    expect(bad).toMatchObject({
      ok: false,
      fieldErrors: { completionType: expect.any(String) },
    });
    const noTarget = parseCommitmentForm(
      form({ title: "x", completionType: "quantity", weight: "0" }),
      own,
    );
    expect(noTarget).toMatchObject({
      ok: false,
      fieldErrors: {
        targetValue: expect.any(String),
        weight: expect.any(String),
      },
    });
  });
});

describe("parseProgress", () => {
  it("accepts non-negative amounts, including over the target", () => {
    expect(parseProgress(0, "quantity")).toBe(0);
    expect(parseProgress(12.3456, "quantity")).toBe(12.346);
    expect(parseProgress(-1, "quantity")).toBeNull();
    expect(parseProgress(Number.NaN, "quantity")).toBeNull();
    expect(parseProgress("3", "quantity")).toBeNull();
  });

  it("accepts only 0 or 1 for boolean commitments", () => {
    expect(parseProgress(1, "boolean")).toBe(1);
    expect(parseProgress(0, "boolean")).toBe(0);
    expect(parseProgress(2, "boolean")).toBeNull();
  });
});
