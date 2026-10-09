import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

/**
 * Round-trips to a real Supabase project that need no account and send no
 * email (addresses use the reserved .test TLD, so they can't exist).
 * Enabled with E2E_USE_REAL_SUPABASE=1; see docs/SETUP.md#end-to-end-tests.
 */
test.skip(
  !process.env.E2E_USE_REAL_SUPABASE,
  "Needs E2E_USE_REAL_SUPABASE=1 and a configured .env.local",
);

const unknownEmail = () => `nobody-${randomUUID()}@lifeos.test`;

test("wrong credentials get a generic error from the real auth server", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(unknownEmail());
  await page.getByLabel("Contraseña").fill("definitely-wrong-password");
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Email o contraseña incorrectos." }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("password recovery never reveals whether an account exists", async ({
  page,
}) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(unknownEmail());
  await page.getByRole("button", { name: "Enviar enlace" }).click();

  await expect(
    page.getByRole("status").filter({ hasText: "Si existe una cuenta" }),
  ).toBeVisible();
});
