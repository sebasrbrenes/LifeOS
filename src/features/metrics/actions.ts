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
  METRIC_DIRECTIONS,
  localDate,
  localDateToInstant,
} from "@/lib/scoring";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

import { syncScoreVersion } from "../scores/versioning";
import { parseMetricForm, type MetricFormValues } from "./metric-form";
import { uniqueMetricKey } from "./metric-key";
import { parseSourceForm } from "./source-form";
import { parseValueForm } from "./values";

const id = z.uuid();

function invalid(message: string): ActionState {
  return { status: "error", message };
}

/** Ratio metrics may only reference other existing metrics. */
function checkRatioReferences(
  values: MetricFormValues,
  ownKey: string | null,
  existingKeys: ReadonlySet<string>,
): ActionState | null {
  if (values.direction !== "ratio") return null;
  const fieldErrors: Record<string, string> = {};
  for (const field of ["numerator", "denominator"] as const) {
    const key = values.config[field];
    if (typeof key !== "string") continue;
    if (key === ownKey || !existingKeys.has(key)) {
      fieldErrors[field] = "Elige otra métrica existente.";
    }
  }
  return Object.keys(fieldErrors).length
    ? { status: "error", fieldErrors }
    : null;
}

export async function createMetric(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();
  const parsed = parseMetricForm(formData);
  if (!parsed.ok) return { status: "error", fieldErrors: parsed.fieldErrors };
  const values = parsed.values;

  const supabase = await createClient();
  const existing = await supabase.from("metric_definitions").select("key");
  if (existing.error) {
    logDatabaseError("load metric keys", existing.error);
    return invalid(databaseErrorMessage(existing.error));
  }
  const keys = new Set(existing.data.map((row) => row.key));
  const referenceError = checkRatioReferences(values, null, keys);
  if (referenceError) return referenceError;

  const { data, error } = await supabase
    .from("metric_definitions")
    .insert({
      key: uniqueMetricKey(values.name, keys),
      name: values.name,
      description: values.description,
      unit: values.unit,
      category_id: values.categoryId,
      direction: values.direction,
      period: values.period,
      aggregation: values.aggregation,
      weight: values.weight,
      config: values.config as Json,
      position: existing.data.length,
    })
    .select("id")
    .single();
  if (error) {
    logDatabaseError("create metric", error);
    return error.code === "23503"
      ? {
          status: "error",
          fieldErrors: { categoryId: "Elige una categoría válida." },
        }
      : invalid(databaseErrorMessage(error));
  }

  await syncScoreVersion(supabase);
  redirect(`/metrics/${data.id}?created=1`);
}

export async function updateMetric(
  metricId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();
  if (!id.safeParse(metricId).success) return invalid("Métrica no válida.");
  const parsed = parseMetricForm(formData);
  if (!parsed.ok) return { status: "error", fieldErrors: parsed.fieldErrors };
  const values = parsed.values;

  const supabase = await createClient();
  const existing = await supabase.from("metric_definitions").select("id, key");
  if (existing.error) return invalid(databaseErrorMessage(existing.error));
  const own = existing.data.find((row) => row.id === metricId);
  if (!own) return invalid("No se encontró la métrica.");
  const referenceError = checkRatioReferences(
    values,
    own.key,
    new Set(existing.data.map((row) => row.key)),
  );
  if (referenceError) return referenceError;

  const { error } = await supabase
    .from("metric_definitions")
    .update({
      name: values.name,
      description: values.description,
      unit: values.unit,
      category_id: values.categoryId,
      direction: values.direction,
      period: values.period,
      aggregation: values.aggregation,
      weight: values.weight,
      config: values.config as Json,
    })
    .eq("id", metricId);
  if (error) {
    logDatabaseError("update metric", error);
    return invalid(databaseErrorMessage(error));
  }

  await syncScoreVersion(supabase);
  refresh();
  return { status: "success", message: "Configuración guardada." };
}

export async function setMetricEnabled(
  metricId: string,
  enabled: boolean,
): Promise<ActionState> {
  await requireUser();
  if (!id.safeParse(metricId).success) return invalid("Métrica no válida.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("metric_definitions")
    .update({ enabled })
    .eq("id", metricId)
    .select("id");
  if (error) return invalid(databaseErrorMessage(error));
  if (data.length === 0) return invalid("No se encontró la métrica.");
  await syncScoreVersion(supabase);
  refresh();
  return {
    status: "success",
    message: enabled
      ? "Métrica activada."
      : "Métrica desactivada: ya no cuenta en el score.",
  };
}

export async function deleteMetric(metricId: string): Promise<ActionState> {
  await requireUser();
  if (!id.safeParse(metricId).success) return invalid("Métrica no válida.");
  const supabase = await createClient();

  const [metric, events, others] = await Promise.all([
    supabase
      .from("metric_definitions")
      .select("key")
      .eq("id", metricId)
      .maybeSingle(),
    supabase
      .from("metric_events")
      .select("id", { count: "exact", head: true })
      .eq("metric_definition_id", metricId),
    supabase
      .from("metric_definitions")
      .select("name, config")
      .neq("id", metricId),
  ]);
  if (metric.error || events.error || others.error) {
    return invalid("No se pudo comprobar la métrica. Inténtalo de nuevo.");
  }
  if (!metric.data) return invalid("No se encontró la métrica.");
  if ((events.count ?? 0) > 0) {
    return invalid(
      "Esta métrica tiene registros y el historial no se borra. Desactívala, o elimina antes sus registros.",
    );
  }
  const key = metric.data.key;
  const dependent = others.data.find((row) => {
    const config = row.config as Record<string, unknown> | null;
    return config?.numerator === key || config?.denominator === key;
  });
  if (dependent) {
    return invalid(
      `El porcentaje «${dependent.name}» depende de esta métrica.`,
    );
  }

  const { error } = await supabase
    .from("metric_definitions")
    .delete()
    .eq("id", metricId);
  if (error) {
    logDatabaseError("delete metric", error);
    return invalid(databaseErrorMessage(error));
  }
  await syncScoreVersion(supabase);
  redirect("/metrics");
}

async function loadMetricForValue(metricId: string) {
  const supabase = await createClient();
  const [metric, profile] = await Promise.all([
    supabase
      .from("metric_definitions")
      .select("id, direction, unit")
      .eq("id", metricId)
      .maybeSingle(),
    supabase.from("profiles").select("timezone").single(),
  ]);
  const row = metric.data;
  if (metric.error || profile.error || !row) return null;
  const direction = METRIC_DIRECTIONS.find((d) => d === row.direction);
  if (!direction) return null;
  return {
    supabase,
    metric: { ...row, direction },
    timeZone: profile.data.timezone,
  };
}

export async function addMetricValue(
  metricId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();
  if (!id.safeParse(metricId).success) return invalid("Métrica no válida.");
  const loaded = await loadMetricForValue(metricId);
  if (!loaded) return invalid("No se encontró la métrica.");
  const { supabase, metric, timeZone } = loaded;

  const now = new Date();
  const parsed = parseValueForm(formData, metric, localDate(now, timeZone));
  if (!parsed.ok) return { status: "error", fieldErrors: parsed.fieldErrors };

  const { error } = await supabase.from("metric_events").insert({
    metric_definition_id: metric.id,
    occurred_at: localDateToInstant(
      parsed.values.date,
      timeZone,
      now,
    ).toISOString(),
    value_numeric: parsed.values.value,
    unit: metric.unit,
    note: parsed.values.note,
    source: "manual",
  });
  if (error) {
    logDatabaseError("add metric value", error);
    return invalid(databaseErrorMessage(error));
  }
  refresh();
  return { status: "success", message: "Valor registrado." };
}

export async function updateMetricValue(
  metricId: string,
  eventId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();
  if (!id.safeParse(metricId).success || !id.safeParse(eventId).success) {
    return invalid("Registro no válido.");
  }
  const loaded = await loadMetricForValue(metricId);
  if (!loaded) return invalid("No se encontró la métrica.");
  const { supabase, metric, timeZone } = loaded;

  const now = new Date();
  const parsed = parseValueForm(formData, metric, localDate(now, timeZone));
  if (!parsed.ok) return { status: "error", fieldErrors: parsed.fieldErrors };

  // RLS only lets users edit their own manual/CSV values.
  const { data, error } = await supabase
    .from("metric_events")
    .update({
      occurred_at: localDateToInstant(
        parsed.values.date,
        timeZone,
        now,
      ).toISOString(),
      value_numeric: parsed.values.value,
      note: parsed.values.note,
    })
    .eq("id", eventId)
    .eq("metric_definition_id", metricId)
    .select("id");
  if (error) {
    logDatabaseError("update metric value", error);
    return invalid(databaseErrorMessage(error));
  }
  if (data.length === 0)
    return invalid("No se encontró el registro o no se puede editar.");
  refresh();
  return { status: "success", message: "Registro actualizado." };
}

export async function deleteMetricValue(eventId: string): Promise<ActionState> {
  await requireUser();
  if (!id.safeParse(eventId).success) return invalid("Registro no válido.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("metric_events")
    .delete()
    .eq("id", eventId)
    .select("id");
  if (error) {
    logDatabaseError("delete metric value", error);
    return invalid(databaseErrorMessage(error));
  }
  if (data.length === 0) return invalid("No se encontró el registro.");
  refresh();
  return { status: "success", message: "Registro eliminado." };
}

/**
 * Links a metric to a provider's canonical metric (or back to manual).
 * Doesn't change how it scores, so no new score version.
 */
export async function updateMetricSource(
  metricId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();
  if (!id.safeParse(metricId).success) return invalid("Métrica no válida.");
  const parsed = parseSourceForm(formData);
  if (!parsed.ok) return { status: "error", fieldErrors: parsed.fieldErrors };
  const { source, sourceMetric, sourceFilter } = parsed.values;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("metric_definitions")
    .update({
      source_preference: source,
      source_metric: sourceMetric,
      source_filter: sourceFilter as Json,
    })
    .eq("id", metricId)
    .select("id");
  if (error) {
    logDatabaseError("update metric source", error);
    return invalid(databaseErrorMessage(error));
  }
  if (data.length === 0) return invalid("No se encontró la métrica.");
  refresh();
  return {
    status: "success",
    message:
      source === "manual"
        ? "Origen: registro manual."
        : "Origen guardado. Los datos llegarán en la próxima sincronización.",
  };
}
