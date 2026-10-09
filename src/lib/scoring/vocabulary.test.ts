import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  COMMITMENT_COMPLETION_TYPES,
  COMMITMENT_STATUSES,
  METRIC_AGGREGATIONS,
  METRIC_DIRECTIONS,
  METRIC_PERIODS,
  METRIC_SOURCES,
} from "./vocabulary";

const migrationsDir = path.join(process.cwd(), "supabase/migrations");
const sql = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => readFileSync(path.join(migrationsDir, name), "utf8"))
  .join("\n")
  .replace(/--.*$/gm, "");

/** Values of every `check (<column> in (...))` for a column. */
function checkValues(column: string): string[][] {
  const pattern = new RegExp(`check \\(${column} in \\(([^)]*)\\)\\)`, "gi");
  return [...sql.matchAll(pattern)].map((match) =>
    [...match[1].matchAll(/'([^']+)'/g)].map((value) => value[1]),
  );
}

describe("vocabularies match the database CHECK constraints", () => {
  it.each([
    ["direction", METRIC_DIRECTIONS],
    ["period", METRIC_PERIODS],
    ["aggregation", METRIC_AGGREGATIONS],
    ["source_preference", METRIC_SOURCES],
    ["source", METRIC_SOURCES],
    ["completion_type", COMMITMENT_COMPLETION_TYPES],
  ] as const)("%s", (column, values) => {
    const found = checkValues(column);
    expect(found.length).toBeGreaterThan(0);
    for (const list of found) {
      expect(list).toEqual([...values]);
    }
  });

  it("commitment status", () => {
    // `status` is used by several tables; find the commitments one.
    const lists = checkValues("status");
    expect(lists).toContainEqual([...COMMITMENT_STATUSES]);
  });
});
