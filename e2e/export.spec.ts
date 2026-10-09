import { readFile } from "node:fs/promises";

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

/** Personal data export (spec §22). */
const env = process.env;
const realSupabase = Boolean(
  env.E2E_USE_REAL_SUPABASE && env.E2E_USER_EMAIL && env.E2E_OTHER_USER_EMAIL,
);

test("signed-out visitors can't export anything", async ({ request }) => {
  const response = await request.get("/settings/export", { maxRedirects: 0 });
  expect([307, 308, 401]).toContain(response.status());
  expect(response.headers()["content-disposition"]).toBeUndefined();
});

test("a user downloads exactly their own data", async ({ page }) => {
  test.skip(!realSupabase, "Needs E2E_USE_REAL_SUPABASE and both test users");

  // B owns a marker row that must never appear in A's export.
  const b = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL!,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  await b.auth.signInWithPassword({
    email: env.E2E_OTHER_USER_EMAIL!,
    password: env.E2E_OTHER_USER_PASSWORD!,
  });
  const marker = `export-probe-${Date.now()}`;
  const goal = await b
    .from("goals")
    .insert({ title: marker })
    .select("id")
    .single();
  expect(goal.error).toBeNull();

  try {
    await page.goto("/login");
    await page.getByLabel("Email").fill(env.E2E_USER_EMAIL!);
    await page.getByLabel("Contraseña").fill(env.E2E_USER_PASSWORD!);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL("/dashboard");

    await page.goto("/settings#datos");
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Exportar mis datos" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(
      /^life-os-export-\d{4}-\d{2}-\d{2}\.json$/,
    );
    const raw = await readFile((await file.path())!, "utf8");
    const data = JSON.parse(raw);

    expect(data).toMatchObject({
      format: "life-os-export",
      formatVersion: 1,
      user: { email: env.E2E_USER_EMAIL },
    });
    expect(data.tables.profiles).toHaveLength(1);
    expect(data.tables.score_categories.length).toBeGreaterThanOrEqual(6);
    expect(data.tables).not.toHaveProperty("oauth_credentials");
    // Only A's rows, and nothing of B's.
    for (const rows of Object.values(data.tables) as Record<
      string,
      unknown
    >[][]) {
      for (const row of rows)
        expect(row.user_id ?? data.user.id).toBe(data.user.id);
    }
    expect(raw).not.toContain(marker);
  } finally {
    await b.from("goals").delete().eq("id", goal.data!.id);
  }
});
