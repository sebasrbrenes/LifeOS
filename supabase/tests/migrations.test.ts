import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Static guards over the SQL migrations. They run in CI without database
 * access; behavioural RLS tests live in database.test.sql (npm run test:db).
 */
const migrationsDir = path.join(process.cwd(), "supabase/migrations");
const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();
const sql = migrationFiles
  .map((name) => readFileSync(path.join(migrationsDir, name), "utf8"))
  .join("\n")
  // Ignore comments so documentation can't satisfy (or trip) the checks.
  .replace(/--.*$/gm, "");

const tables = [
  ...sql.matchAll(/create table (?:if not exists )?public\.(\w+)/gi),
].map((match) => match[1]);

const statements = (pattern: RegExp) =>
  sql
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => pattern.test(statement));

describe("migrations", () => {
  it("are named <timestamp>_<snake_case>.sql", () => {
    for (const name of migrationFiles) {
      expect(name).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
    }
  });

  it("create the spec §21 tables, plus ai_insights (phase 11)", () => {
    expect(new Set(tables)).toEqual(
      new Set([
        "profiles",
        "score_categories",
        "metric_definitions",
        "metric_events",
        "goals",
        "goal_milestones",
        "weekly_commitments",
        "score_versions",
        "score_snapshots",
        "integrations",
        "oauth_credentials",
        "sync_runs",
        "weekly_reviews",
        "ai_insights",
      ]),
    );
  });

  it.each(tables)("public.%s enables row level security", (table) => {
    expect(sql).toMatch(
      new RegExp(
        `alter table public\\.${table} enable row level security`,
        "i",
      ),
    );
  });

  it.each(tables)(
    "public.%s revokes Supabase's default grants from API roles",
    (table) => {
      expect(sql).toMatch(
        new RegExp(
          `revoke all on table public\\.${table} from anon, authenticated`,
          "i",
        ),
      );
    },
  );

  it("never grants table privileges to anon", () => {
    expect(statements(/^grant\b/i).filter((s) => /\banon\b/i.test(s))).toEqual(
      [],
    );
  });

  it("scopes every policy to the authenticated role", () => {
    const policies = statements(/^create policy\b/i);
    expect(policies.length).toBeGreaterThan(0);
    for (const policy of policies) {
      expect(policy, policy.split("\n")[0]).toMatch(/\bto authenticated\b/i);
    }
  });

  it("pins search_path on every function", () => {
    const functions = statements(/^create (or replace )?function\b/i);
    expect(functions.length).toBeGreaterThan(0);
    for (const fn of functions) {
      expect(fn, fn.split("\n")[0]).toMatch(/set search_path = ''/i);
    }
  });
});
