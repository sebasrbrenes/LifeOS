import { describe, expect, it } from "vitest";

import {
  mainGoalSchema,
  parseCategorySettings,
  profileSettingsSchema,
} from "./schemas";

const IDS = ["c1", "c2", "c3"];

function categoriesForm(
  rows: { weight: string; enabled?: boolean; name?: string; id?: string }[],
) {
  const data = new FormData();
  rows.forEach((row, i) => {
    data.append(`categories.${i}.id`, row.id ?? IDS[i]);
    data.append(`categories.${i}.name`, row.name ?? `Cat ${i}`);
    data.append(`categories.${i}.weight`, row.weight);
    if (row.enabled ?? true) data.append(`categories.${i}.enabled`, "on");
  });
  return data;
}

describe("parseCategorySettings", () => {
  const known = new Set(IDS);

  it("accepts enabled weights totalling 100", () => {
    const result = parseCategorySettings(
      categoriesForm([{ weight: "50" }, { weight: "30" }, { weight: "20" }]),
      known,
    );
    expect(result).toEqual({
      ok: true,
      categories: [
        { id: "c1", name: "Cat 0", weight: 50, enabled: true },
        { id: "c2", name: "Cat 1", weight: 30, enabled: true },
        { id: "c3", name: "Cat 2", weight: 20, enabled: true },
      ],
    });
  });

  it("accepts one decimal without float drift", () => {
    const result = parseCategorySettings(
      categoriesForm([
        { weight: "33,3" },
        { weight: "33.3" },
        { weight: "33,4" },
      ]),
      known,
    );
    expect(result.ok).toBe(true);
  });

  it("ignores weights of disabled categories and stores 0", () => {
    const result = parseCategorySettings(
      categoriesForm([
        { weight: "60" },
        { weight: "40" },
        { weight: "25", enabled: false },
      ]),
      known,
    );
    expect(result.ok && result.categories[2]).toEqual({
      id: "c3",
      name: "Cat 2",
      weight: 0,
      enabled: false,
    });
  });

  it("explains a wrong total", () => {
    const result = parseCategorySettings(
      categoriesForm([{ weight: "50" }, { weight: "30" }, { weight: "25" }]),
      known,
    );
    expect(!result.ok && result.formError).toBe(
      "Los pesos de las categorías activas deben sumar 100 % (ahora suman 105 %).",
    );
  });

  it.each([
    [
      [{ weight: "abc" }, { weight: "50" }, { weight: "50" }],
      "categories.0.weight",
      "Introduce un número.",
    ],
    [
      [{ weight: "150" }, { weight: "0" }, { weight: "0" }],
      "categories.0.weight",
      "Entre 0 y 100.",
    ],
    [
      [{ weight: "33.33" }, { weight: "33.33" }, { weight: "33.34" }],
      "categories.0.weight",
      "Como máximo un decimal.",
    ],
    [
      [{ weight: "50", name: "" }, { weight: "50" }, { weight: "0" }],
      "categories.0.name",
      "Entre 1 y 60 caracteres.",
    ],
  ])("flags field errors %#", (rows, field, message) => {
    const result = parseCategorySettings(categoriesForm(rows), known);
    expect(!result.ok && result.fieldErrors[field]).toBe(message);
  });

  it("requires at least one enabled category", () => {
    const result = parseCategorySettings(
      categoriesForm([
        { weight: "0", enabled: false },
        { weight: "0", enabled: false },
        { weight: "0", enabled: false },
      ]),
      known,
    );
    expect(!result.ok && result.formError).toBe(
      "Activa al menos una categoría.",
    );
  });

  it("rejects ids that aren't the user's", () => {
    const result = parseCategorySettings(
      categoriesForm([{ weight: "100", id: "someone-else" }]),
      known,
    );
    expect(!result.ok && result.formError).toBe("Categoría desconocida.");
  });
});

describe("profileSettingsSchema", () => {
  it("validates timezone and week start", () => {
    expect(
      profileSettingsSchema.safeParse({
        displayName: "",
        timezone: "America/Bogota",
        weekStartsOn: "1",
      }).data,
    ).toEqual({
      displayName: null,
      timezone: "America/Bogota",
      weekStartsOn: 1,
    });
    expect(
      profileSettingsSchema.safeParse({
        displayName: "",
        timezone: "Mars/Base",
        weekStartsOn: "1",
      }).success,
    ).toBe(false);
    expect(
      profileSettingsSchema.safeParse({
        displayName: "",
        timezone: "UTC",
        weekStartsOn: "7",
      }).success,
    ).toBe(false);
  });
});

describe("mainGoalSchema", () => {
  it("normalises optional fields", () => {
    expect(
      mainGoalSchema.parse({
        title: " Conseguir rol QA ",
        categoryId: "",
        targetDate: "",
      }),
    ).toEqual({
      title: "Conseguir rol QA",
      categoryId: null,
      targetDate: null,
    });
    expect(
      mainGoalSchema.safeParse({ title: "", categoryId: "", targetDate: "" })
        .success,
    ).toBe(false);
  });
});
