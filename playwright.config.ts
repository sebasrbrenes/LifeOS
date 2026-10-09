import { existsSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

/**
 * Browser channel. Defaults to Playwright's bundled Chromium (CI). Set
 * PLAYWRIGHT_CHANNEL=chrome or msedge to reuse a locally installed browser.
 */
const channel = process.env.PLAYWRIGHT_CHANNEL || undefined;

/**
 * Real-Supabase runs read the project keys and E2E test users from
 * .env.local, and run serially: the specs share one test user's data.
 */
const useRealSupabase = Boolean(process.env.E2E_USE_REAL_SUPABASE);
if (useRealSupabase && existsSync(".env.local"))
  process.loadEnvFile(".env.local");

/**
 * Signed-out flows run against placeholder Supabase settings: they never
 * reach Supabase. Signed-in flows need a real development project; see
 * docs/SETUP.md#end-to-end-tests.
 */
const PLACEHOLDER_SUPABASE_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e-placeholder-anon-key",
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: !useRealSupabase,
  workers: useRealSupabase ? 1 : undefined,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], channel },
    },
    {
      // iPhone viewport/touch emulation on Chromium. Real Safari checks
      // happen in the PWA phase.
      name: "mobile",
      use: { ...devices["iPhone 15"], browserName: "chromium", channel },
    },
  ],
  webServer: {
    // CI builds in a previous step; locally build so tests hit production
    // output, not the dev server.
    command: process.env.CI
      ? `npm run start -- --port ${PORT}`
      : `npm run build && npm run start -- --port ${PORT}`,
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_APP_URL: baseURL,
      ...(useRealSupabase ? {} : PLACEHOLDER_SUPABASE_ENV),
    },
  },
});
