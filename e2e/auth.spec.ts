import { expect, test } from "@playwright/test";

test.describe("signed-out access", () => {
  test("root sends signed-out users to login, remembering the destination", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveURL("/login?next=%2Fdashboard");
    await expect(
      page.getByRole("heading", { name: "Iniciar sesión" }),
    ).toBeVisible();
  });

  for (const path of ["/dashboard", "/settings", "/reset-password"]) {
    test(`${path} is protected`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(`/login?next=${encodeURIComponent(path)}`);
    });
  }

  test("an auth link without parameters is rejected", async ({ page }) => {
    await page.goto("/auth/confirm");
    await expect(page).toHaveURL("/login?error=link_invalid");
    // Next.js also renders an (empty) role="alert" route announcer.
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "El enlace no es válido o ha caducado" }),
    ).toBeVisible();
  });
});

test.describe("login page", () => {
  test("has labelled fields and links to the other auth pages", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Contraseña")).toBeVisible();

    await page.getByRole("link", { name: "¿Olvidaste tu contraseña?" }).click();
    await expect(page).toHaveURL("/forgot-password");
    await expect(
      page.getByRole("heading", { name: "Recuperar acceso" }),
    ).toBeVisible();

    await page.goto("/login");
    await page.getByRole("link", { name: "Crear cuenta" }).click();
    await expect(page).toHaveURL("/signup");
    await expect(
      page.getByRole("heading", { name: "Crear cuenta" }),
    ).toBeVisible();
  });

  test("validates input on the server and keeps the email", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page.getByText("Introduce un email válido.")).toBeVisible();
    await expect(page.getByText("Introduce tu contraseña.")).toBeVisible();
    await expect(page.getByLabel("Email")).toHaveValue("not-an-email");
    await expect(page.getByLabel("Email")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });
});

test.describe("signup page", () => {
  test("rejects short and mismatched passwords", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Email").fill("athlete@example.com");
    await page.getByLabel("Contraseña", { exact: true }).fill("short");
    await page.getByLabel("Repite la contraseña").fill("different");
    await page.getByRole("button", { name: "Crear cuenta" }).click();

    await expect(page.getByText(/al menos 8 caracteres/)).toBeVisible();
    await expect(page.getByText("Las contraseñas no coinciden.")).toBeVisible();
  });
});

test.describe("platform", () => {
  test("sends baseline security headers", async ({ request }) => {
    const response = await request.get("/login");
    const headers = response.headers();
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["x-powered-by"]).toBeUndefined();
  });

  test("auth pages fit the viewport without horizontal scroll", async ({
    page,
  }) => {
    for (const path of ["/login", "/signup", "/forgot-password"]) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow, path).toBe(0);
    }
  });
});
