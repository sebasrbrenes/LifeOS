import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 5 end to end against real Supabase: plan a week, log progress,
 * watch the Week Score with exact numbers, then close a finished week,
 * review it, and prove the closed week is frozen in the database.
 *
 * Closed weeks can't be reopened or deleted by users (by design), so each
 * run closes a different, older week of the E2E user.
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

function addDays(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The user's current week start, computed like the app does. */
async function currentWeekStart(a: SupabaseClient) {
  const { data, error } = await a
    .from("profiles")
    .select("timezone, week_starts_on")
    .single();
  if (error) throw error;
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: data.timezone,
  }).format(new Date());
  const [y, m, d] = today.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDays(today, -((weekday - data.week_starts_on + 7) % 7));
}

/** Removes commitments from open weeks around now (closed ones are history). */
async function clearOpenWeeks(a: SupabaseClient, weekStart: string) {
  const { error } = await a
    .from("weekly_commitments")
    .delete()
    .gte("week_start", addDays(weekStart, -7));
  if (error) throw error;
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

const commitmentCard = (page: Page, title: string) =>
  page.getByRole("listitem").filter({ hasText: title });

let week: string;

test.beforeEach(async () => {
  const a = await apiAsA();
  week = await currentWeekStart(a);
  await clearOpenWeeks(a, week);
});

test.afterEach(async () => {
  const a = await apiAsA();
  await clearOpenWeeks(a, week);
});

test("plan the week, log progress and see an exact Week Score", async ({
  page,
}) => {
  page.on("dialog", (dialog) => dialog.accept());
  const a = await apiAsA();
  // Last week's plan, to start this one from. (Bulk inserts send NULL
  // for keys missing in a row, so both rows list the same columns.)
  const seeded = await a.from("weekly_commitments").insert([
    {
      week_start: addDays(week, -7),
      title: "Correr",
      completion_type: "quantity",
      target_value: 3,
      unit: "salidas",
      position: 0,
    },
    {
      week_start: addDays(week, -7),
      title: "Revisión semanal",
      completion_type: "boolean",
      target_value: 1,
      unit: null,
      position: 1,
    },
  ]);
  expect(seeded.error).toBeNull();

  await signIn(page);
  await page.getByRole("link", { name: "Semana", exact: true }).first().click();
  await expect(page).toHaveURL("/week");
  await expect(page.getByText("Esta semana", { exact: true })).toBeVisible();

  const score = panel(page, "Week Score");
  await page
    .getByRole("button", { name: /Copiar los 2 compromiso\(s\)/ })
    .click();
  await expect(page.getByText("2 compromiso(s) copiados")).toBeVisible();
  await expect(score.getByText("0 de 2 compromisos completados")).toBeVisible();

  // 2 of 3 runs, weights 1 + 1: 2/3 × ½ = 33.3 → shown floored.
  await page.getByRole("button", { name: "Sumar uno a «Correr»" }).click();
  await expect(commitmentCard(page, "Correr")).toContainText("1 / 3 salidas");
  await page.getByRole("button", { name: "Sumar uno a «Correr»" }).click();
  await expect(commitmentCard(page, "Correr")).toContainText("2 / 3 salidas");
  await expect(score).toContainText("33");

  await page.getByRole("button", { name: "Marcar como hecho" }).click();
  await expect(score.getByText("1 de 2 compromisos completados")).toBeVisible();
  await expect(score).toContainText("83"); // (2/3 + 1) / 2

  // A heavier commitment: weight 2.
  const add = panel(page, "Añadir compromiso");
  await add.getByLabel("Compromiso").fill("Solicitudes de empleo");
  await add.getByLabel("Objetivo").fill("5");
  await add.getByLabel("Peso").fill("2");
  await add.getByRole("button", { name: "Añadir compromiso" }).click();
  await expect(add.getByText("Compromiso añadido.")).toBeVisible();
  await expect(add.getByLabel("Compromiso")).toHaveValue("");
  await expect(score).toContainText("41"); // (2/3 + 1 + 0) / 4

  // Exact progress, past the target: capped, no extra score.
  await page.getByLabel("Progreso exacto de «Solicitudes de empleo»").fill("7");
  await commitmentCard(page, "Solicitudes de empleo")
    .getByRole("button", { name: "Fijar" })
    .click();
  await expect(commitmentCard(page, "Solicitudes de empleo")).toContainText(
    "7 / 5",
  );
  await expect(score).toContainText("91"); // (2/3 + 1 + 2) / 4

  // Cancelling removes it from the score but keeps it visible.
  const review = commitmentCard(page, "Revisión semanal");
  await review.getByText("Editar o cancelar").click();
  await review.getByRole("button", { name: "Cancelar compromiso" }).click();
  await expect(review).toContainText("Cancelado: no cuenta");
  await expect(score).toContainText("88"); // (2/3 + 2) / 3

  // Editing re-plans: Correr becomes 2 runs → done.
  const runs = commitmentCard(page, "Correr");
  await runs.getByText("Editar o cancelar").click();
  await runs.getByLabel("Objetivo").fill("2");
  await runs.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(runs).toContainText("2 / 2 salidas");
  await expect(score).toContainText("100");

  const apps = commitmentCard(page, "Solicitudes de empleo");
  await apps.getByText("Editar o cancelar").click();
  await apps.getByRole("button", { name: "Eliminar" }).click();
  await expect(apps).toHaveCount(0);
  await expect(score.getByText("1 de 1 compromisos completados")).toBeVisible();

  // The dashboard shows the same execution score.
  await page.getByRole("link", { name: "Dashboard" }).first().click();
  const dashboardWeek = panel(page, "Week Score");
  await expect(dashboardWeek).toContainText("100");
  await expect(
    dashboardWeek.getByText(/1 de 1 compromisos completados/),
  ).toBeVisible();
});

test("close a finished week, review it, and it stays frozen", async ({
  page,
}) => {
  const a = await apiAsA();
  // An older week nobody has closed yet (each run uses a new one).
  const { data: reviews } = await a.from("weekly_reviews").select("week_start");
  const closed = new Set((reviews ?? []).map((r) => r.week_start));
  let past = addDays(week, -14);
  while (closed.has(past)) past = addDays(past, -7);
  await a.from("weekly_commitments").delete().eq("week_start", past);
  const seeded = await a.from("weekly_commitments").insert([
    {
      week_start: past,
      title: "Gimnasio",
      target_value: 4,
      actual_value: 4,
      position: 0,
    },
    {
      week_start: past,
      title: "Leer",
      target_value: 2,
      actual_value: 0,
      position: 1,
    },
  ]);
  expect(seeded.error).toBeNull();

  await signIn(page);
  const banner = page.getByRole("region", { name: "Semanas por cerrar" });
  await expect(banner).toBeVisible();
  await banner.getByRole("link").last().click();
  await expect(page).toHaveURL(`/review/${past}`);
  await expect(page.getByText("Vista previa · sin guardar")).toBeVisible();

  const weekScore = panel(page, "Week Score · ejecución");
  await expect(weekScore).toContainText("50");
  await expect(
    weekScore.getByText("1 de 2 compromisos completados (50 %)."),
  ).toBeVisible();
  await expect(panel(page, "Siguiente foco")).toBeVisible();

  await page
    .getByLabel("Notas de la semana (opcional)")
    .fill("Leer quedó pendiente: bloquear 30 min por la noche.");
  await page
    .getByRole("button", { name: "Cerrar semana y guardar revisión" })
    .click();
  await expect(page).toHaveURL(`/review/${past}?cerrada=1`);
  await expect(
    page.getByText("Semana cerrada y revisión guardada."),
  ).toBeVisible();
  await expect(page.getByLabel("Notas")).toHaveValue(
    "Leer quedó pendiente: bloquear 30 min por la noche.",
  );

  // Notes stay editable.
  await page.getByLabel("Notas").fill("Nota revisada.");
  await page.getByRole("button", { name: "Guardar notas" }).click();
  await expect(page.getByText("Notas guardadas.")).toBeVisible();

  // The optional AI analysis says honestly that it isn't configured.
  await expect(
    page.getByText(/El análisis con IA es opcional y no está configurado/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Generar análisis/ }),
  ).toHaveCount(0);

  // The week page is read-only now.
  await page.goto(`/week?w=${past}`);
  await expect(
    page.getByText("Semana cerrada: sus compromisos ya son historial."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Sumar uno/ })).toHaveCount(0);
  await expect(page.getByText("Editar o cancelar")).toHaveCount(0);

  // It's listed in the history.
  await page.getByRole("link", { name: "Ver revisión" }).click();
  await page.getByRole("link", { name: "Revisiones" }).click();
  await expect(page).toHaveURL("/review");
  // (Next keeps the previous route hidden in the DOM; only count visible.)
  await expect(
    page.locator(`a[href="/review/${past}"]`).filter({ visible: true }),
  ).toBeVisible();

  // And the database refuses changes, whatever the client sends.
  const frozen = await a
    .from("weekly_commitments")
    .update({ actual_value: 2 })
    .eq("week_start", past)
    .select("id");
  expect(frozen.error).toBeNull();
  expect(frozen.data).toEqual([]);
  const rescore = await a
    .from("weekly_reviews")
    .update({ week_score: 100 })
    .eq("week_start", past);
  expect(rescore.error?.code).toBe("42501");
  const stored = await a
    .from("weekly_reviews")
    .select("week_score, user_notes, summary")
    .eq("week_start", past)
    .single();
  expect(stored.data?.week_score).toBe(50);
  expect(stored.data?.user_notes).toBe("Nota revisada.");
  expect(stored.data?.summary).toMatchObject({
    summaryVersion: 1,
    execution: { completed: 1, total: 2 },
  });
});
