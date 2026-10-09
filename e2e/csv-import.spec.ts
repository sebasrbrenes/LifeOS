import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

/** CSV import into a metric, end to end against real Supabase. */
const env = process.env;
const enabled = Boolean(env.E2E_USE_REAL_SUPABASE && env.E2E_USER_EMAIL);
test.skip(
  !enabled,
  "Needs E2E_USE_REAL_SUPABASE and the E2E test users in .env.local",
);

async function apiAsA() {
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL!,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await supabase.auth.signInWithPassword({
    email: env.E2E_USER_EMAIL!,
    password: env.E2E_USER_PASSWORD!,
  });
  if (error) throw new Error(`sign-in failed: ${error.code}`);
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

async function upload(page: Page, name: string, content: string) {
  await page.getByLabel("Métrica").selectOption({ label: "Ahorro (€)" });
  await page.getByLabel("Archivo CSV").setInputFiles({
    name,
    mimeType: "text/csv",
    buffer: Buffer.from(content, "utf8"),
  });
  await page.getByRole("button", { name: "Importar valores" }).click();
}

test.beforeEach(async () => clearMetrics(await apiAsA()));
test.afterEach(async () => clearMetrics(await apiAsA()));

test("import a spreadsheet of values, safely and idempotently", async ({
  page,
}) => {
  const a = await apiAsA();
  const money = await a
    .from("score_categories")
    .select("id")
    .eq("key", "money")
    .single();
  const metric = await a
    .from("metric_definitions")
    .insert({
      category_id: money.data!.id,
      key: `csv_${Date.now()}`,
      name: "Ahorro",
      unit: "€",
      direction: "higher_is_better",
      period: "all_time",
      aggregation: "latest",
      config: { target: 5000 },
    })
    .select("id")
    .single();
  expect(metric.error).toBeNull();

  await signIn(page);
  await page.goto("/integrations");

  // A bad row: nothing is imported and the line is named.
  await upload(
    page,
    "malo.csv",
    "fecha;valor\n2026-01-05;1200\n2026-02-30;1300\n",
  );
  await expect(page.getByText(/No se importó nada.*línea 3/)).toBeVisible();

  const csv =
    "fecha;valor;nota\n2026-01-05;1200;enero\n05/02/2026;1500,50;\n2026-03-05;2100;marzo\n";
  await upload(page, "ahorro.csv", csv);
  await expect(page.getByText("3 valor(es) importados.")).toBeVisible();

  // Same file again: nothing duplicated.
  await upload(page, "ahorro.csv", csv);
  await expect(
    page.getByText("Todos los valores del archivo ya estaban importados."),
  ).toBeVisible();

  const stored = await a
    .from("metric_events")
    .select("value_numeric, source, note")
    .eq("metric_definition_id", metric.data!.id)
    .order("occurred_at");
  expect(stored.data).toEqual([
    { value_numeric: 1200, source: "csv_import", note: "enero" },
    { value_numeric: 1500.5, source: "csv_import", note: null },
    { value_numeric: 2100, source: "csv_import", note: "marzo" },
  ]);

  // The values score and show their origin.
  await page.goto(`/metrics/${metric.data!.id}`);
  await expect(page.getByText("Importación CSV").first()).toBeVisible();
  await expect(page.getByText("2100 €").first()).toBeVisible();
});
