import { expect, test } from "@playwright/test";

/**
 * Signed-in journey against a real Supabase project. Requires a confirmed
 * test user and E2E_USE_REAL_SUPABASE=1 so the app uses the real project
 * from .env.local. See docs/SETUP.md#end-to-end-tests.
 */
const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;

test.skip(
  !process.env.E2E_USE_REAL_SUPABASE || !email || !password,
  "Needs E2E_USE_REAL_SUPABASE, E2E_USER_EMAIL and E2E_USER_PASSWORD",
);

test("sign in, use the app shell and sign out", async ({ page }) => {
  await page.goto("/settings");
  await expect(page).toHaveURL("/login?next=%2Fsettings");

  await page.getByLabel("Email").fill(email!);
  await page.getByLabel("Contraseña").fill(password!);
  await page.getByRole("button", { name: "Entrar" }).click();

  // Returns to the page that was originally requested.
  await expect(page).toHaveURL("/settings");
  await expect(
    page.getByRole("main").getByText(email!.toLowerCase()),
  ).toBeVisible();

  const nav = page.getByRole("navigation", { name: "Principal" }).filter({
    visible: true,
  });
  await nav.getByRole("link", { name: "Dashboard" }).click();
  await expect(page).toHaveURL("/dashboard");
  await expect(
    page.getByRole("img", { name: /^Life Score: / }).first(),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Week Score" })).toBeVisible();

  // Signed-in users skip the login page.
  await page.goto("/login");
  await expect(page).toHaveURL("/dashboard");

  await page.goto("/settings");
  await page
    .getByRole("main")
    .getByRole("button", { name: "Cerrar sesión" })
    .click();
  await expect(page).toHaveURL("/login");

  await page.goto("/dashboard");
  await expect(page).toHaveURL("/login?next=%2Fdashboard");
});
