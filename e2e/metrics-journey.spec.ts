import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

/**
 * The phase 4 promise, end to end against real Supabase: sign in, create a
 * metric, enter (and backdate, edit, delete) real values, and watch the
 * Life Score change — with exact, explainable numbers.
 *
 * Uses the dedicated E2E test users (docs/SETUP.md). Resets user A's
 * metrics, goal and weights before and after.
 */
const env = process.env;
const enabled = Boolean(
  env.E2E_USE_REAL_SUPABASE && env.E2E_USER_EMAIL && env.E2E_OTHER_USER_EMAIL,
);
test.skip(
  !enabled,
  "Needs E2E_USE_REAL_SUPABASE and the E2E test users in .env.local",
);

const DEFAULT_WEIGHTS: Record<string, number> = {
  career: 25,
  business: 20,
  body: 20,
  money: 15,
  discipline: 10,
  life: 10,
};

async function apiAs(email: string, password: string) {
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL!,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in failed: ${error.code}`);
  return supabase;
}

/** Puts user A back to a known state: no metrics, no goal, default weights. */
async function resetUserA() {
  const a = await apiAs(env.E2E_USER_EMAIL!, env.E2E_USER_PASSWORD!);
  const metrics = await a.from("metric_definitions").select("id");
  for (const { id } of metrics.data ?? []) {
    await a.from("metric_events").delete().eq("metric_definition_id", id);
  }
  await a.from("metric_definitions").delete().not("id", "is", null);
  await a
    .from("profiles")
    .update({ primary_goal_id: null })
    .not("user_id", "is", null);
  await a.from("goals").delete().not("id", "is", null);
  const categories = await a.from("score_categories").select("id, key, name");
  await a.rpc("update_category_settings", {
    p_categories: (categories.data ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      weight: DEFAULT_WEIGHTS[c.key] ?? 0,
      enabled: c.key in DEFAULT_WEIGHTS,
    })),
  });
  return a;
}

/** YYYY-MM-DD `days` before today in `timeZone`. */
function localDaysAgo(days: number, timeZone: string) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone }).format(
    new Date(),
  );
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10);
}

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(env.E2E_USER_EMAIL!);
  await page.getByLabel("Contraseña").fill(env.E2E_USER_PASSWORD!);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL("/dashboard");
}

const panel = (page: Page, title: string) =>
  page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });

let otherUsersMetricId: string;

test.beforeAll(async () => {
  await resetUserA();
  const b = await apiAs(
    env.E2E_OTHER_USER_EMAIL!,
    env.E2E_OTHER_USER_PASSWORD!,
  );
  const category = await b
    .from("score_categories")
    .select("id")
    .eq("key", "body")
    .single();
  const metric = await b
    .from("metric_definitions")
    .insert({
      category_id: category.data!.id,
      key: `private_${Date.now()}`,
      name: "Métrica privada de B",
      direction: "higher_is_better",
      period: "weekly",
      aggregation: "sum",
      config: { target: 1 },
    })
    .select("id")
    .single();
  if (metric.error) throw metric.error;
  otherUsersMetricId = metric.data.id;
});

test.afterAll(async () => {
  await resetUserA();
  const b = await apiAs(
    env.E2E_OTHER_USER_EMAIL!,
    env.E2E_OTHER_USER_PASSWORD!,
  );
  await b.from("metric_definitions").delete().eq("id", otherUsersMetricId);
});

test("create a metric, record real values and see an explained Life Score", async ({
  page,
}) => {
  page.on("dialog", (dialog) => dialog.accept());
  await signIn(page);

  // Empty state guides the first step.
  await page.getByRole("link", { name: "Crear mi primera métrica" }).click();
  await expect(page).toHaveURL("/metrics/new");

  // Start from a template, adjust, create.
  await page
    .getByLabel("Empezar desde una plantilla")
    .selectOption({ label: "Distancia corriendo" });
  await expect(page.getByLabel("Nombre")).toHaveValue("Distancia corriendo");
  await expect(page.getByLabel("Objetivo (km)")).toHaveValue("15");
  await page.getByRole("button", { name: "Crear métrica" }).click();
  await expect(page).toHaveURL(/\/metrics\/[0-9a-f-]{36}\?created=1$/);
  await expect(page.getByText("Métrica creada.")).toBeVisible();

  const state = panel(page, "Estado actual");
  await expect(state).toContainText("Sin datos");

  // Today's value: 12 of 15 km → 80 (spec §37 example).
  await page.getByLabel("Valor (km)").fill("12");
  await page.getByRole("button", { name: "Registrar" }).click();
  await expect(page.getByText("Valor registrado.")).toBeVisible();
  await expect(state).toContainText("12 km");
  await expect(state.getByText("80", { exact: true })).toBeVisible();

  // Backdated value inside the 7-day window: 12 + 3 = 15 km → 100.
  await page.getByLabel("Valor (km)").fill("3");
  await page.getByLabel("Fecha").fill(localDaysAgo(3, "America/Bogota"));
  await page.getByRole("button", { name: "Registrar" }).click();
  await expect(state).toContainText("15 km");
  await expect(state.getByText("100", { exact: true })).toBeVisible();

  // A future date is rejected with a clear message.
  await page.getByLabel("Valor (km)").fill("5");
  await page.getByLabel("Fecha").fill(localDaysAgo(-2, "America/Bogota"));
  await page.getByRole("button", { name: "Registrar" }).click();
  await expect(
    page.getByText("No puedes registrar valores en el futuro."),
  ).toBeVisible();

  // Edit the 12 km entry to 6 km: 6 + 3 = 9 km → 60.
  const history = page.getByRole("list", { name: "Historial de registros" });
  const twelve = history.getByRole("listitem").filter({ hasText: "12 km" });
  await twelve.getByRole("button", { name: /^Editar registro/ }).click();
  await twelve.getByLabel("Valor (km)").fill("6");
  await twelve.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(state).toContainText("9 km");
  await expect(state.getByText("60", { exact: true })).toBeVisible();

  // Dashboard: only Body has data, so Life Score = 60 → rank A.
  await page.goto("/dashboard");
  await expect(
    page.getByRole("img", { name: "Life Score: 60 de 100, rango A" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /^Body: 60, rango A$/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /^Career: sin datos$/ }),
  ).toBeVisible();

  // Explanation: the metric contributes all 60 points.
  await page.goto("/score");
  const body = page.locator("#categoria-body");
  await expect(body).toContainText("Distancia corriendo");
  await expect(body).toContainText("60 pts");
  await expect(page.getByText("no cuentan como 0")).toBeVisible();
});

test("category weights must total 100 and create a new score version", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/settings");

  const bodyWeight = page.getByLabel("Peso de Body (%)");
  await bodyWeight.fill("25");
  await expect(
    page.getByRole("status").filter({ hasText: "sobran 5 %" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Guardar pesos" }).click();
  await expect(page.getByText("ahora suman 105 %")).toBeVisible();

  await page.getByLabel("Peso de Career (%)").fill("20");
  await page.getByRole("button", { name: "Guardar pesos" }).click();
  await expect(page.getByText("Pesos guardados.")).toBeVisible();

  // The open score version now records the new weights.
  const a = await apiAs(env.E2E_USER_EMAIL!, env.E2E_USER_PASSWORD!);
  const version = await a
    .from("score_versions")
    .select("configuration")
    .is("effective_to", null)
    .single();
  const categories = (
    version.data!.configuration as {
      categories: { key: string; weight: number }[];
    }
  ).categories;
  expect(categories.find((c) => c.key === "body")?.weight).toBe(25);
  expect(categories.find((c) => c.key === "career")?.weight).toBe(20);
});

test("main objective appears on the dashboard", async ({ page }) => {
  await signIn(page);
  await page.goto("/settings");
  await page
    .getByLabel("Objetivo", { exact: true })
    .fill("Conseguir mi próximo rol de QA");
  await page.getByRole("button", { name: "Guardar objetivo" }).click();
  await expect(page.getByText("Objetivo principal guardado.")).toBeVisible();
  await page.goto("/dashboard");
  await expect(panel(page, "Objetivo principal")).toContainText(
    "Conseguir mi próximo rol de QA",
  );
});

test("another user's metric is not reachable through the app", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/metrics/${otherUsersMetricId}`);
  await expect(
    page.getByRole("heading", { name: "No encontrado" }),
  ).toBeVisible();
  await expect(page.getByText("Métrica privada de B")).toHaveCount(0);
});

test("values and metrics can be deleted", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await signIn(page);
  await page.goto("/metrics");
  await page.getByRole("link", { name: /Distancia corriendo/ }).click();

  const deleteMetric = page.getByRole("button", { name: "Eliminar métrica" });
  await expect(deleteMetric).toBeDisabled(); // history is never silently destroyed

  const history = page.getByRole("list", { name: "Historial de registros" });
  while ((await history.getByRole("listitem").count()) > 0) {
    const before = await history.getByRole("listitem").count();
    await history
      .getByRole("button", { name: /^Eliminar registro/ })
      .first()
      .click();
    await expect(history.getByRole("listitem")).toHaveCount(before - 1);
  }
  await expect(page.getByText("Aún no hay registros.")).toBeVisible();

  await deleteMetric.click();
  await expect(page).toHaveURL("/metrics");
  await expect(
    page.getByRole("link", { name: "Crear mi primera métrica" }),
  ).toBeVisible();
});
