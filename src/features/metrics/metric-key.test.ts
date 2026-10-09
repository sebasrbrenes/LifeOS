import { describe, expect, it } from "vitest";

import { slugifyMetricKey, uniqueMetricKey } from "./metric-key";

const KEY_PATTERN = /^[a-z][a-z0-9_]{0,59}$/;

describe("slugifyMetricKey", () => {
  it.each([
    ["Distancia corriendo (km)", "distancia_corriendo_km"],
    ["Ahorro líquido", "ahorro_liquido"],
    ["Sesiones de estudio QA", "sesiones_de_estudio_qa"],
    ["  ¿Satisfacción?  ", "satisfaccion"],
    ["5K time", "m_5k_time"],
    ["!!!", "metric"],
    ["Ñandú", "nandu"],
  ])("%j → %s", (name, key) => {
    expect(slugifyMetricKey(name)).toBe(key);
  });

  it("always produces a key the database accepts", () => {
    for (const name of [
      "a".repeat(200),
      "9".repeat(80),
      "_x_",
      "é",
      "😀 run",
    ]) {
      expect(slugifyMetricKey(name)).toMatch(KEY_PATTERN);
    }
  });
});

describe("uniqueMetricKey", () => {
  it("adds a numeric suffix on collision", () => {
    expect(uniqueMetricKey("Sueño", new Set())).toBe("sueno");
    expect(uniqueMetricKey("Sueño", new Set(["sueno"]))).toBe("sueno_2");
    expect(uniqueMetricKey("Sueño", new Set(["sueno", "sueno_2"]))).toBe(
      "sueno_3",
    );
  });

  it("keeps suffixed keys within the length limit", () => {
    const long = "a".repeat(60);
    const key = uniqueMetricKey(long, new Set([long]));
    expect(key).toMatch(KEY_PATTERN);
    expect(key.endsWith("_2")).toBe(true);
  });
});
