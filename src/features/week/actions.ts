"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  databaseErrorMessage,
  logDatabaseError,
  type ActionState,
} from "@/lib/action-state";
import { requireUser } from "@/lib/auth/session";
import {
  COMMITMENT_COMPLETION_TYPES,
  localDate,
  startOfWeek,
  type LocalDate,
} from "@/lib/scoring";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

import { loadScoringInputs } from "../scores/data";
import { parseCommitmentForm, parseProgress } from "./commitment-form";
import { computeReview, type CommitmentRecord } from "./data";
import {
  canPlanWeek,
  canTrackProgress,
  isClosable,
  parseLocalDate,
} from "./period";

const id = z.uuid();
const CLOSED_WEEK =
  "Esta semana ya está cerrada: su historial no se puede cambiar.";

function invalid(message: string): ActionState {
  return { status: "error", message };
}

type Client = Awaited<ReturnType<typeof createClient>>;

/** The user's local "today" and week settings, read fresh for each action. */
async function userCalendar(supabase: Client) {
  const { data, error } = await supabase
    .from("profiles")
    .select("timezone, week_starts_on")
    .single();
  if (error) throw new Error(`Failed to load profile: ${error.message}`);
  const today = localDate(new Date(), data.timezone);
  return {
    today,
    currentWeekStart: startOfWeek(today, data.week_starts_on),
  };
}

async function isWeekClosed(supabase: Client, weekStart: LocalDate) {
  const { count, error } = await supabase
    .from("weekly_reviews")
    .select("week_start", { count: "exact", head: true })
    .eq("week_start", weekStart);
  if (error) throw new Error(`Failed to check week: ${error.message}`);
  return (count ?? 0) > 0;
}

async function ownCategoryIds(supabase: Client) {
  const { data, error } = await supabase.from("score_categories").select("id");
  if (error) throw new Error(`Failed to load categories: ${error.message}`);
  return new Set(data.map((row) => row.id));
}

async function loadCommitment(supabase: Client, commitmentId: string) {
  const { data, error } = await supabase
    .from("weekly_commitments")
    .select("id, week_start, completion_type, status")
    .eq("id", commitmentId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load commitment: ${error.message}`);
  return data;
}

const PAST_WEEK =
  "Las semanas pasadas solo admiten registrar progreso: sus objetivos no se cambian a posteriori.";

/**
 * Loads a commitment that may still be re-planned: current or future week.
 * Past weeks only accept progress, so targets can't be bent after the fact.
 */
async function loadPlannableCommitment(
  supabase: Client,
  commitmentId: string,
): Promise<
  | {
      ok: true;
      commitment: NonNullable<Awaited<ReturnType<typeof loadCommitment>>>;
      today: LocalDate;
    }
  | { ok: false; state: ActionState }
> {
  const commitment = await loadCommitment(supabase, commitmentId);
  if (!commitment)
    return { ok: false, state: invalid("No se encontró el compromiso.") };
  const { today, currentWeekStart } = await userCalendar(supabase);
  if (!canPlanWeek(commitment.week_start, currentWeekStart))
    return { ok: false, state: invalid(PAST_WEEK) };
  return { ok: true, commitment, today };
}

export async function createCommitment(
  weekStart: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();
  const week = parseLocalDate(weekStart);
  if (!week) return invalid("Semana no válida.");
  const supabase = await createClient();

  const { currentWeekStart } = await userCalendar(supabase);
  if (!canPlanWeek(week, currentWeekStart)) {
    return invalid(
      "Solo puedes añadir compromisos a esta semana o a las próximas cuatro.",
    );
  }
  if (await isWeekClosed(supabase, week)) return invalid(CLOSED_WEEK);

  const parsed = parseCommitmentForm(formData, await ownCategoryIds(supabase));
  if (!parsed.ok) return { status: "error", fieldErrors: parsed.fieldErrors };
  const values = parsed.values;

  const { count } = await supabase
    .from("weekly_commitments")
    .select("id", { count: "exact", head: true })
    .eq("week_start", week);
  const { error } = await supabase.from("weekly_commitments").insert({
    week_start: week,
    title: values.title,
    category_id: values.categoryId,
    completion_type: values.completionType,
    target_value: values.targetValue,
    unit: values.unit,
    weight: values.weight,
    position: count ?? 0,
  });
  if (error) {
    logDatabaseError("create commitment", error);
    return invalid(
      error.code === "42501" ? CLOSED_WEEK : databaseErrorMessage(error),
    );
  }
  refresh();
  return { status: "success", message: "Compromiso añadido." };
}

export async function updateCommitment(
  commitmentId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();
  if (!id.safeParse(commitmentId).success)
    return invalid("Compromiso no válido.");
  const supabase = await createClient();
  const parsed = parseCommitmentForm(formData, await ownCategoryIds(supabase));
  if (!parsed.ok) return { status: "error", fieldErrors: parsed.fieldErrors };
  const values = parsed.values;

  const loaded = await loadPlannableCommitment(supabase, commitmentId);
  if (!loaded.ok) return loaded.state;
  const { commitment: current, today } = loaded;

  // Progress in one unit means nothing in another: changing type resets it.
  const progress =
    values.completionType !== current.completion_type
      ? { actual_value: 0 }
      : {};
  const { data, error } = await supabase
    .from("weekly_commitments")
    .update({
      title: values.title,
      category_id: values.categoryId,
      completion_type: values.completionType,
      target_value: values.targetValue,
      unit: values.unit,
      weight: values.weight,
      ...progress,
      // A future week can't have progress yet.
      ...(canTrackProgress(current.week_start, today)
        ? {}
        : { actual_value: 0 }),
    })
    .eq("id", commitmentId)
    .select("id");
  if (error) {
    logDatabaseError("update commitment", error);
    return invalid(databaseErrorMessage(error));
  }
  if (data.length === 0) return invalid(CLOSED_WEEK);
  refresh();
  return { status: "success", message: "Compromiso actualizado." };
}

/** Sets how much of a commitment is done (absolute value, idempotent). */
export async function setCommitmentProgress(
  commitmentId: string,
  value: number,
): Promise<ActionState> {
  await requireUser();
  if (!id.safeParse(commitmentId).success)
    return invalid("Compromiso no válido.");
  const supabase = await createClient();
  const current = await loadCommitment(supabase, commitmentId);
  if (!current) return invalid("No se encontró el compromiso.");

  const type = COMMITMENT_COMPLETION_TYPES.find(
    (t) => t === current.completion_type,
  );
  const progress = type ? parseProgress(value, type) : null;
  if (progress === null) return invalid("Valor de progreso no válido.");
  if (current.status === "cancelled")
    return invalid("Reactiva el compromiso para registrar progreso.");
  const { today } = await userCalendar(supabase);
  if (!canTrackProgress(current.week_start, today))
    return invalid("Esta semana aún no ha empezado.");

  const { data, error } = await supabase
    .from("weekly_commitments")
    .update({ actual_value: progress })
    .eq("id", commitmentId)
    .select("id");
  if (error) {
    logDatabaseError("set commitment progress", error);
    return invalid(databaseErrorMessage(error));
  }
  if (data.length === 0) return invalid(CLOSED_WEEK);
  refresh();
  return { status: "success" };
}

/** Cancelled commitments stay visible but leave the Week Score. */
export async function setCommitmentCancelled(
  commitmentId: string,
  cancelled: boolean,
): Promise<ActionState> {
  await requireUser();
  if (!id.safeParse(commitmentId).success)
    return invalid("Compromiso no válido.");
  const supabase = await createClient();
  const loaded = await loadPlannableCommitment(supabase, commitmentId);
  if (!loaded.ok) return loaded.state;
  const { data, error } = await supabase
    .from("weekly_commitments")
    .update({ status: cancelled ? "cancelled" : "active" })
    .eq("id", commitmentId)
    .in("status", cancelled ? ["active"] : ["cancelled"])
    .select("id");
  if (error) {
    logDatabaseError("cancel commitment", error);
    return invalid(databaseErrorMessage(error));
  }
  if (data.length === 0) return invalid(CLOSED_WEEK);
  refresh();
  return {
    status: "success",
    message: cancelled
      ? "Compromiso cancelado: ya no cuenta en el Week Score."
      : "Compromiso reactivado.",
  };
}

export async function deleteCommitment(
  commitmentId: string,
): Promise<ActionState> {
  await requireUser();
  if (!id.safeParse(commitmentId).success)
    return invalid("Compromiso no válido.");
  const supabase = await createClient();
  const loaded = await loadPlannableCommitment(supabase, commitmentId);
  if (!loaded.ok) return loaded.state;
  const { data, error } = await supabase
    .from("weekly_commitments")
    .delete()
    .eq("id", commitmentId)
    .select("id");
  if (error) {
    logDatabaseError("delete commitment", error);
    return invalid(databaseErrorMessage(error));
  }
  if (data.length === 0) return invalid(CLOSED_WEEK);
  refresh();
  return { status: "success", message: "Compromiso eliminado." };
}

/**
 * Copies a week's commitments into another (planned) week with progress
 * reset — the usual way to start a week similar to the last one.
 */
export async function copyCommitments(
  fromWeek: string,
  toWeek: string,
): Promise<ActionState> {
  await requireUser();
  const from = parseLocalDate(fromWeek);
  const to = parseLocalDate(toWeek);
  if (!from || !to || from === to) return invalid("Semana no válida.");
  const supabase = await createClient();
  const { currentWeekStart } = await userCalendar(supabase);
  if (!canPlanWeek(to, currentWeekStart))
    return invalid("Solo puedes planificar esta semana o las próximas.");
  if (await isWeekClosed(supabase, to)) return invalid(CLOSED_WEEK);

  const [source, existing] = await Promise.all([
    supabase
      .from("weekly_commitments")
      .select(
        "title, category_id, target_value, unit, weight, completion_type, position",
      )
      .eq("week_start", from)
      .neq("status", "cancelled")
      .order("position")
      .order("created_at"),
    supabase
      .from("weekly_commitments")
      .select("id", { count: "exact", head: true })
      .eq("week_start", to),
  ]);
  if (source.error || existing.error)
    return invalid("No se pudieron leer los compromisos.");
  if ((existing.count ?? 0) > 0)
    return invalid("Esta semana ya tiene compromisos.");
  if (source.data.length === 0)
    return invalid("La semana anterior no tiene compromisos que copiar.");

  const { error } = await supabase.from("weekly_commitments").insert(
    source.data.map((row, index) => ({
      ...row,
      position: index,
      week_start: to,
      actual_value: 0,
      status: "active",
    })),
  );
  if (error) {
    logDatabaseError("copy commitments", error);
    return invalid(databaseErrorMessage(error));
  }
  refresh();
  return {
    status: "success",
    message: `${source.data.length} compromiso(s) copiados. Ajusta los objetivos si hace falta.`,
  };
}

/**
 * Closes a week: recomputes the review on the server (never trusting the
 * client), then closes the commitments and stores the review atomically.
 */
export async function closeWeek(
  weekStart: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();
  const week = parseLocalDate(weekStart);
  if (!week) return invalid("Semana no válida.");
  const rawNotes = formData.get("notes");
  const notes = typeof rawNotes === "string" ? rawNotes.trim() : "";
  if (notes.length > 10_000)
    return {
      status: "error",
      fieldErrors: { notes: "Máximo 10 000 caracteres." },
    };

  const inputs = await loadScoringInputs();
  if (!isClosable(week, inputs.today))
    return invalid("La semana aún no ha llegado a su último día.");
  const supabase = await createClient();
  const { data: commitments, error: loadError } = await supabase
    .from("weekly_commitments")
    .select(
      "id, title, category_id, target_value, actual_value, weight, completion_type, status, unit, position, week_start",
    )
    .eq("week_start", week);
  if (loadError) return invalid(databaseErrorMessage(loadError));

  const review = computeReview(
    inputs,
    week,
    commitments satisfies CommitmentRecord[],
  );
  const { error } = await supabase.rpc("close_week", {
    p_week_start: week,
    // Generated RPC types mark every argument non-null; NULL means "no data".
    p_life_score_start: review.lifeScoreStart as number,
    p_life_score_end: review.lifeScoreEnd as number,
    p_week_score: review.weekScore as number,
    p_score_version_id: (inputs.scoreVersion?.id ?? null) as string,
    p_summary: review.summary as unknown as Json,
    p_user_notes: notes,
  });
  if (error) {
    logDatabaseError("close week", error);
    return invalid(
      error.code === "23505"
        ? "Esta semana ya estaba cerrada."
        : error.code === "23514"
          ? "La semana aún no ha llegado a su último día."
          : databaseErrorMessage(error),
    );
  }
  redirect(`/review/${week}?cerrada=1`);
}

export async function updateReviewNotes(
  weekStart: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();
  const week = parseLocalDate(weekStart);
  if (!week) return invalid("Semana no válida.");
  const rawNotes = formData.get("notes");
  const notes = typeof rawNotes === "string" ? rawNotes.trim() : "";
  if (notes.length > 10_000)
    return {
      status: "error",
      fieldErrors: { notes: "Máximo 10 000 caracteres." },
    };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("weekly_reviews")
    .update({ user_notes: notes || null })
    .eq("week_start", week)
    .select("week_start");
  if (error) {
    logDatabaseError("update review notes", error);
    return invalid(databaseErrorMessage(error));
  }
  if (data.length === 0) return invalid("No se encontró la revisión.");
  refresh();
  return { status: "success", message: "Notas guardadas." };
}
