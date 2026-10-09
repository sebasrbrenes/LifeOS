import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

/**
 * Integrations without provider credentials on the server: every provider
 * says honestly that it isn't configured, connecting explains why, the
 * scheduled-sync endpoint is closed, and metrics can already be linked to
 * a provider source.
 */
const env = process.env;
const realSupabase = Boolean(env.E2E_USE_REAL_SUPABASE && env.E2E_USER_EMAIL);

test("the scheduled sync endpoint is closed without the cron secret", async ({
  request,
}) => {
  const response = await request.get("/api/cron/sync");
  expect(response.status()).toBe(401);
  const forged = await request.get("/api/cron/sync", {
    headers: { Authorization: "Bearer guess" },
  });
  expect(forged.status()).toBe(401);
});

async function apiAsA() {
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL!,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  await supabase.auth.signInWithPassword({
    email: env.E2E_USER_EMAIL!,
    password: env.E2E_USER_PASSWORD!,
  });
  return supabase;
}

async function clearMetrics(a: SupabaseClient) {
  const metrics = await a.from("metric_definitions").select("id");
  for (const { id } of metrics.data ?? [])
    await a.from("metric_events").delete().eq("metric_definition_id", id);
  await a.from("metric_definitions").delete().not("id", "is", null);
}

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(env.E2E_USER_EMAIL!);
  await page.getByLabel("Contraseña").fill(env.E2E_USER_PASSWORD!);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL("/dashboard");
}

test.describe("signed in", () => {
  test.skip(!realSupabase, "Needs E2E_USE_REAL_SUPABASE and the test users");
  test.beforeEach(async () => clearMetrics(await apiAsA()));
  test.afterEach(async () => clearMetrics(await apiAsA()));

  test("providers show their real state and metrics can be linked", async ({
    page,
  }) => {
    const a = await apiAsA();
    const body = await a
      .from("score_categories")
      .select("id")
      .eq("key", "body")
      .single();
    const metric = await a
      .from("metric_definitions")
      .insert({
        category_id: body.data!.id,
        key: `strava_${Date.now()}`,
        name: "Km semanales",
        unit: "km",
        direction: "higher_is_better",
        period: "weekly",
        aggregation: "sum",
        config: { target: 20 },
      })
      .select("id")
      .single();
    expect(metric.error).toBeNull();

    await signIn(page);
    await page.goto("/integrations");
    const strava = page.getByRole("article").filter({ hasText: "Strava" });
    await expect(strava.getByText("Sin configurar")).toBeVisible();
    await expect(strava.getByText(/STRAVA_CLIENT_ID/)).toBeVisible();
    await expect(strava.getByRole("link", { name: /Conectar/ })).toHaveCount(0);
    const health = page
      .getByRole("article")
      .filter({ hasText: "Google Health" });
    await expect(health.getByText("No disponible")).toBeVisible();

    // Hitting the connect URL anyway explains instead of failing.
    await page.goto("/integrations/strava/connect");
    await expect(page).toHaveURL("/integrations?error=not_configured");
    await expect(
      page.getByText("Esta integración no está configurada en el servidor."),
    ).toBeVisible();

    // Link the metric to Strava runs, trail runs only.
    await page.goto(`/metrics/${metric.data!.id}`);
    const source = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Origen de los datos" }),
    });
    await source.getByLabel("Origen").selectOption("strava.run_distance_km");
    await expect(source.getByText(/Strava no está conectado/)).toBeVisible();
    await source.getByLabel("Solo estos deportes (opcional)").fill("TrailRun");
    await source.getByRole("button", { name: "Guardar origen" }).click();
    await expect(source.getByText(/Origen guardado/)).toBeVisible();

    const stored = await a
      .from("metric_definitions")
      .select("source_preference, source_metric, source_filter")
      .eq("id", metric.data!.id)
      .single();
    expect(stored.data).toEqual({
      source_preference: "strava",
      source_metric: "strava.run_distance_km",
      source_filter: { sportTypes: ["TrailRun"] },
    });

    // And back to manual.
    await source.getByLabel("Origen").selectOption("manual");
    await source.getByRole("button", { name: "Guardar origen" }).click();
    await expect(source.getByText("Origen: registro manual.")).toBeVisible();
  });
});
