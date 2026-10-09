#!/usr/bin/env node
/**
 * Runs supabase/tests/*.test.sql against the linked Supabase project inside
 * a transaction that is always rolled back — nothing persists.
 *
 *   npm run test:db               # test the schema as currently applied
 *   npm run test:db -- --pending  # dry-run: apply migrations not yet on the
 *                                 # remote, test, then roll everything back
 *
 * Use `--pending` before `supabase db push` to prove a migration works.
 * Requires `supabase login` and `supabase link` (see docs/SETUP.md). Use a
 * development project, never production.
 */
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const includePending = process.argv.includes("--pending");
const SUCCESS_MARKER = "ok: all database tests passed";

function runSql(sql) {
  const workDir = mkdtempSync(path.join(tmpdir(), "life-os-dbtest-"));
  const sqlPath = path.join(workDir, "run.sql");
  writeFileSync(sqlPath, sql);
  try {
    const result = spawnSync(
      "npx",
      ["supabase", "db", "query", "--linked", "-f", sqlPath],
      { cwd: root, encoding: "utf8", shell: process.platform === "win32" },
    );
    return {
      ok: result.status === 0,
      stdout: result.stdout ?? "",
      output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
    };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

function sqlFiles(dir, suffix) {
  return readdirSync(dir)
    .filter((name) => name.endsWith(suffix))
    .sort()
    .map((name) => path.join(dir, name));
}

function appliedMigrationVersions() {
  const result = runSql(
    "select version from supabase_migrations.schema_migrations;",
  );
  if (!result.ok) {
    console.error(result.output.trim());
    throw new Error("Could not read applied migrations.");
  }
  const json = JSON.parse(result.stdout.slice(result.stdout.indexOf("{")));
  return new Set(json.rows.map((row) => String(row.version)));
}

const parts = ["begin;"];
if (includePending) {
  const applied = appliedMigrationVersions();
  const pending = sqlFiles(
    path.join(root, "supabase/migrations"),
    ".sql",
  ).filter((file) => !applied.has(path.basename(file).split("_")[0]));
  console.log(
    pending.length
      ? `Dry-running ${pending.length} pending migration(s): ${pending.map((f) => path.basename(f)).join(", ")}`
      : "No pending migrations.",
  );
  for (const file of pending) {
    parts.push(
      `-- migration: ${path.basename(file)}`,
      readFileSync(file, "utf8"),
    );
  }
}
const testFiles = sqlFiles(path.join(root, "supabase/tests"), ".test.sql");
for (const file of testFiles) {
  parts.push(`-- test: ${path.basename(file)}`, readFileSync(file, "utf8"));
}
parts.push("rollback;");

console.log(`Running ${testFiles.length} database test file(s)…`);
const result = runSql(parts.join("\n\n"));
if (result.ok && result.output.includes(SUCCESS_MARKER)) {
  console.log("✓ All database tests passed (transaction rolled back).");
  process.exit(0);
}

console.error(result.output.trim());
console.error("✗ Database tests failed (transaction rolled back).");
process.exit(1);
