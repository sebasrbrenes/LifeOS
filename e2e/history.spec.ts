import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 6 end to end: values dated in the past appear in history, and
 * "You vs You" compares two dates with exact, explainable numbers.
 */
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

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(env.E2E_USER_EMAIL!);
  await page.getByLabel("Contraseña").fill(env.E2E_USER_PASSWORD!);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL("/dashboard");
}

function localDaysAgo(days: number, timeZone: string) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone }).format(
    new Date(),
  );
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10);
}

/** Removes every metric (and its values) of user A. */
async function clearMetrics(a: SupabaseClient) {
  const metrics = await a.from("metric_definitions").select("id");
  for (const { id } of metrics.data ?? [])
    await a.from("metric_events").delete().eq("metric_definition_id", id);
  await a.from("metric_definitions").delete().not("id", "is", null);
}

test.beforeEach(async () => clearMetrics(await apiAsA()));
test.afterEach(async () => clearMetrics(await apiAsA()));

test("backdated values build history and You vs You compares two dates", async ({
  page,
}) => {
  const a = await apiAsA();
  const { data: profile } = await a
    .from("profiles")
    .select("timezone")
    .single();
  const zone = profile!.timezone;
  const body = await a
    .from("score_categories")
    .select("id")
    .eq("key", "body")
    .single();
  const metric = await a
    .from("metric_definitions")
    .insert({
      category_id: body.data!.id,
      key: `history_${Date.now()}`,
      name: "Fuerza",
      unit: "kg",
      direction: "higher_is_better",
      period: "all_time",
      aggregation: "latest",
      config: { target: 100 },
    })
    .select("id")
    .single();
  expect(metric.error).toBeNull();
  // Entered today, dated 20 days ago and today.
  const values = await a.from("metric_events").insert([
    {
      metric_definition_id: metric.data!.id,
      occurred_at: new Date(Date.now() - 20 * 86_400_000).toISOString(),
      value_numeric: 40,
    },
    {
      metric_definition_id: metric.data!.id,
      occurred_at: new Date().toISOString(),
      value_numeric: 80,
    },
  ]);
  expect(values.error).toBeNull();

  await signIn(page);
  await page.getByRole("link", { name: "Historial" }).first().click();
  await expect(page).toHaveURL("/history");

  // The chart exists and its text summary describes the real series.
  await expect(page.getByText(/^Life Score: de 40 a 80/)).toBeAttached();
  await expect(
    page.getByRole("button", { name: "Body", pressed: true }),
  ).toBeVisible();

  // You vs You: 15 days ago (40 kg) vs today (80 kg).
  const before = localDaysAgo(15, zone);
  await page.getByLabel("Antes").fill(before);
  await page.getByRole("button", { name: "Comparar" }).click();
  await expect(page).toHaveURL(new RegExp(`desde=${before}`));
  const youVsYou = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Tú vs tú" }) });
  const life = youVsYou.getByRole("row", { name: /^Life Score/ });
  await expect(life).toContainText("40");
  await expect(life).toContainText("80");
  await expect(life).toContainText("+40");
  await expect(youVsYou.getByRole("row", { name: /^Body/ })).toContainText(
    "+40",
  );
  const strength = youVsYou.getByRole("row", { name: /^Fuerza/ });
  await expect(strength).toContainText("40 kg");
  await expect(strength).toContainText("80 kg");

  // Before any value: no fake zero.
  await page.goto(`/history?desde=${localDaysAgo(60, zone)}`);
  await expect(
    youVsYou.getByRole("row", { name: /^Life Score/ }),
  ).toContainText("—");

  // The trend table agrees: +40 against 7 days ago (no data 30 days ago).
  const trend = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Tendencia" }) });
  await expect(trend.getByRole("row", { name: /^Life Score/ })).toContainText(
    "+40",
  );

  // Ranges switch the chart period.
  await page.getByRole("link", { name: "30 días" }).click();
  await expect(page).toHaveURL("/history?rango=30");
  await expect(page.getByRole("link", { name: "30 días" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});
