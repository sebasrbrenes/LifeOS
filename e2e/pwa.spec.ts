import { expect, test } from "@playwright/test";

/**
 * Phase 9: installable PWA. Runs against the production build without a
 * session (no Supabase needed): manifest, icons, security headers, the
 * service worker and the offline fallback.
 */

test("the manifest makes the app installable", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    name: "Life OS",
    display: "standalone",
    start_url: "/dashboard",
    lang: "es",
  });
  const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
  expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  expect(
    manifest.icons.some(
      (icon: { purpose?: string }) => icon.purpose === "maskable",
    ),
  ).toBe(true);
  for (const icon of manifest.icons as { src: string }[]) {
    const image = await request.get(icon.src);
    expect(image.ok(), icon.src).toBe(true);
    expect(image.headers()["content-type"]).toBe("image/png");
  }
});

test("pages declare iPhone home-screen support", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  await expect(
    page.locator(
      'meta[name="mobile-web-app-capable"], meta[name="apple-mobile-web-app-capable"]',
    ),
  ).not.toHaveCount(0);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#0b0d12",
  );
});

test("responses carry a strict Content-Security-Policy", async ({
  request,
}) => {
  const response = await request.get("/login");
  const csp = response.headers()["content-security-policy"];
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).not.toContain("unsafe-eval");
});

test("the service worker is served fresh and the offline page is public", async ({
  request,
}) => {
  const worker = await request.get("/sw.js");
  expect(worker.ok()).toBe(true);
  expect(worker.headers()["cache-control"]).toContain("no-cache");
  const offline = await request.get("/offline", { maxRedirects: 0 });
  expect(offline.status()).toBe(200);
});

test("offline navigation shows the offline page, then recovers", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/login");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // The first load isn't controlled yet; reload so the worker handles it.
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);

  await context.setOffline(true);
  await page.goto("/forgot-password").catch(() => undefined);
  await expect(
    page.getByRole("heading", { name: "Sin conexión" }),
  ).toBeVisible();

  // Back online: "Reintentar" reloads the real page. The browser takes a
  // moment to tell the service worker, so retry like a user would.
  await context.setOffline(false);
  await expect(async () => {
    await page.getByRole("button", { name: "Reintentar" }).click();
    await expect(page).toHaveTitle(/Recuperar acceso/, { timeout: 1000 });
  }).toPass();
  await expect(page).toHaveURL("/forgot-password");
  expect(errors).toEqual([]);
});
