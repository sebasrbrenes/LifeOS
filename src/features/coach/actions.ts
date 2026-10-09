"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import {
  databaseErrorMessage,
  logDatabaseError,
  type ActionState,
} from "@/lib/action-state";
import {
  AiError,
  DEFAULT_AI_MODEL,
  requestCoachInsight,
} from "@/lib/ai/anthropic";
import { buildCoachPayload, findUnsupportedNumbers } from "@/lib/ai/coach";
import { requireUser } from "@/lib/auth/session";
import { getServerEnv } from "@/lib/env/server";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

import { loadDiagnostics } from "../analytics/data";
import { loadScoringOverview } from "../scores/data";
import { loadWeek } from "../week/data";
import { parseLocalDate } from "../week/period";
import { MAX_INSIGHTS_PER_WEEK } from "./limits";

const AI_ERRORS: Record<AiError["code"], string> = {
  unauthorized: "La clave de la IA no es válida. Revisa ANTHROPIC_API_KEY.",
  rate_limited: "La IA está saturada ahora mismo. Inténtalo en un rato.",
  unavailable: "La IA no responde ahora mismo. Inténtalo más tarde.",
  bad_response: "La IA devolvió una respuesta no válida. Inténtalo de nuevo.",
};

/**
 * Asks the AI coach to analyse a closed week (spec §30). Sends only the
 * structured review; saves the result only if every number in it comes
 * from that data (one retry otherwise).
 */
export async function generateWeeklyInsight(
  weekStart: string,
): Promise<ActionState> {
  await requireUser();
  const week = parseLocalDate(weekStart);
  if (!week) return { status: "error", message: "Semana no válida." };
  const env = getServerEnv();
  if (!env.ANTHROPIC_API_KEY)
    return {
      status: "error",
      message: "El análisis con IA no está configurado.",
    };

  const supabase = await createClient();
  const { count } = await supabase
    .from("ai_insights")
    .select("id", { count: "exact", head: true })
    .eq("week_start", week);
  if ((count ?? 0) >= MAX_INSIGHTS_PER_WEEK)
    return {
      status: "error",
      message: `Máximo ${MAX_INSIGHTS_PER_WEEK} análisis por semana.`,
    };

  const view = await loadWeek(week);
  const summary = view.review?.summary;
  if (!view.review || !summary)
    return {
      status: "error",
      message: "Cierra la semana antes de analizarla.",
    };
  const [{ primaryGoal }, { diagnostics }] = await Promise.all([
    loadScoringOverview(),
    loadDiagnostics(),
  ]);
  const payload = buildCoachPayload({
    weekStart: view.weekStart,
    weekEnd: view.weekEnd,
    mainGoal: primaryGoal?.title ?? null,
    summary,
    commitments: view.week.commitments.map((c) => ({
      title: c.title,
      target: c.targetValue,
      done: c.actualValue,
      completed: c.completed,
      cancelled: c.status === "cancelled",
    })),
    alerts: diagnostics,
  });

  const model = env.AI_MODEL ?? DEFAULT_AI_MODEL;
  let insight = null;
  try {
    for (let attempt = 0; attempt < 2 && !insight; attempt += 1) {
      const candidate = await requestCoachInsight(fetch, {
        apiKey: env.ANTHROPIC_API_KEY,
        model,
        payload,
      });
      if (findUnsupportedNumbers(candidate, payload).length === 0)
        insight = candidate;
    }
  } catch (error) {
    console.error("[coach] request failed", {
      code: error instanceof AiError ? error.code : "unknown",
    });
    return {
      status: "error",
      message:
        error instanceof AiError
          ? AI_ERRORS[error.code]
          : "No se pudo generar el análisis.",
    };
  }
  if (!insight)
    return {
      status: "error",
      message:
        "La IA mencionó cifras que no están en tus datos, así que no se guardó. Vuelve a intentarlo.",
    };

  const { error } = await supabase.from("ai_insights").insert({
    week_start: week,
    model,
    payload: payload as unknown as Json,
    content: insight as unknown as Json,
  });
  if (error) {
    logDatabaseError("save ai insight", error);
    return { status: "error", message: databaseErrorMessage(error) };
  }
  refresh();
  return { status: "success", message: "Análisis generado." };
}

export async function deleteInsight(insightId: string): Promise<ActionState> {
  await requireUser();
  if (!z.uuid().safeParse(insightId).success)
    return { status: "error", message: "Análisis no válido." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_insights")
    .delete()
    .eq("id", insightId)
    .select("id");
  if (error || data.length === 0)
    return { status: "error", message: "No se pudo borrar el análisis." };
  refresh();
  return { status: "success", message: "Análisis borrado." };
}
