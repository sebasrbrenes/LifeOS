"use server";

import { refresh } from "next/cache";

import {
  databaseErrorMessage,
  logDatabaseError,
  type ActionState,
} from "@/lib/action-state";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { syncScoreVersion } from "../scores/versioning";
import {
  mainGoalSchema,
  parseCategorySettings,
  profileSettingsSchema,
} from "./schemas";

function fieldErrorsOf(issues: { path: PropertyKey[]; message: string }[]) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues)
    fieldErrors[String(issue.path[0] ?? "form")] ??= issue.message;
  return fieldErrors;
}

export async function saveCategorySettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();
  const supabase = await createClient();
  const own = await supabase.from("score_categories").select("id");
  if (own.error)
    return { status: "error", message: databaseErrorMessage(own.error) };

  const parsed = parseCategorySettings(
    formData,
    new Set(own.data.map((row) => row.id)),
  );
  if (!parsed.ok) {
    return {
      status: "error",
      message: parsed.formError,
      fieldErrors: parsed.fieldErrors,
    };
  }

  // One transaction: weights can move between categories without passing
  // through an invalid total, and the database re-checks the sum.
  const { error } = await supabase.rpc("update_category_settings", {
    p_categories: parsed.categories,
  });
  if (error) {
    logDatabaseError("update category settings", error);
    return {
      status: "error",
      message:
        error.code === "23514"
          ? "Los pesos de las categorías activas deben sumar 100 %."
          : databaseErrorMessage(error),
    };
  }

  await syncScoreVersion(supabase);
  refresh();
  return {
    status: "success",
    message: "Pesos guardados. Tu Life Score ya usa la nueva configuración.",
  };
}

export async function saveProfileSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = profileSettingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { status: "error", fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: parsed.data.displayName,
      timezone: parsed.data.timezone,
      week_starts_on: parsed.data.weekStartsOn,
    })
    .eq("user_id", user.id);
  if (error) {
    logDatabaseError("update profile", error);
    return { status: "error", message: databaseErrorMessage(error) };
  }
  refresh();
  return { status: "success", message: "Preferencias guardadas." };
}

export async function saveMainGoal(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = mainGoalSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { status: "error", fieldErrors: fieldErrorsOf(parsed.error.issues) };
  const goal = {
    title: parsed.data.title,
    category_id: parsed.data.categoryId,
    target_date: parsed.data.targetDate,
  };

  const supabase = await createClient();
  const profile = await supabase
    .from("profiles")
    .select("primary_goal_id")
    .single();
  if (profile.error)
    return { status: "error", message: databaseErrorMessage(profile.error) };

  if (profile.data.primary_goal_id) {
    const { error } = await supabase
      .from("goals")
      .update(goal)
      .eq("id", profile.data.primary_goal_id);
    if (error) {
      logDatabaseError("update main goal", error);
      return { status: "error", message: databaseErrorMessage(error) };
    }
  } else {
    const created = await supabase
      .from("goals")
      .insert(goal)
      .select("id")
      .single();
    if (created.error) {
      logDatabaseError("create main goal", created.error);
      return { status: "error", message: databaseErrorMessage(created.error) };
    }
    const { error } = await supabase
      .from("profiles")
      .update({ primary_goal_id: created.data.id })
      .eq("user_id", user.id);
    if (error) {
      logDatabaseError("set main goal", error);
      return { status: "error", message: databaseErrorMessage(error) };
    }
  }
  refresh();
  return { status: "success", message: "Objetivo principal guardado." };
}
