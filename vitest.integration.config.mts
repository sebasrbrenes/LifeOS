import { existsSync } from "node:fs";

import { defineConfig } from "vitest/config";

/**
 * Integration tests against the linked development Supabase project.
 * Needs .env.local with the project keys and E2E_* test users
 * (docs/SETUP.md). Not part of `npm test` or CI.
 */
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "E2E_USER_EMAIL",
  "E2E_USER_PASSWORD",
  "E2E_OTHER_USER_EMAIL",
  "E2E_OTHER_USER_PASSWORD",
];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  throw new Error(
    `Integration tests need: ${missing.join(", ")} (see docs/SETUP.md)`,
  );
}

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.integration.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
