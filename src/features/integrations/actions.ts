"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import {
  databaseErrorMessage,
  logDatabaseError,
  type ActionState,
} from "@/lib/action-state";
import { requireUser } from "@/lib/auth/session";
import {
  CSV_MAX_BYTES,
  csvRecordId,
  parseValuesCsv,
} from "@/lib/integrations/csv";
import {
  METRIC_DIRECTIONS,
  localDate,
  localDateToInstant,
} from "@/lib/scoring";
import { createClient } from "@/lib/supabase/server";

const id = z.uuid();
const CHUNK = 200;

function invalid(message: string): ActionState {
  return { status: "error", message };
}

/**
 * Imports a CSV of dated values into one metric (source "csv_import").
 * All-or-nothing validation; values already imported (same date and
 * value) are skipped, so re-importing a file is harmless.
 */
export async function importCsv(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();
  const metricId = formData.get("metricId");
  if (typeof metricId !== "string" || !id.safeParse(metricId).success)
    return { status: "error", fieldErrors: { metricId: "Elige una métrica." } };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { status: "error", fieldErrors: { file: "Elige un archivo CSV." } };
  if (file.size > CSV_MAX_BYTES)
    return {
      status: "error",
      fieldErrors: { file: "El archivo es demasiado grande (máx. 900 KB)." },
    };

  const supabase = await createClient();
  const [metric, profile] = await Promise.all([
    supabase
      .from("metric_definitions")
      .select("id, direction, unit")
      .eq("id", metricId)
      .maybeSingle(),
    supabase.from("profiles").select("timezone").single(),
  ]);
  if (metric.error || profile.error)
    return invalid("No se pudo leer la métrica.");
  const direction = METRIC_DIRECTIONS.find((d) => d === metric.data?.direction);
  if (!metric.data || !direction)
    return { status: "error", fieldErrors: { metricId: "Elige una métrica." } };

  const target = metric.data;
  const now = new Date();
  const timeZone = profile.data.timezone;
  const parsed = parseValuesCsv(
    await file.text(),
    direction,
    localDate(now, timeZone),
  );
  if (!parsed.ok) {
    return {
      status: "error",
      message: `No se importó nada. Corrige el archivo: ${parsed.errors
        .map((e) => (e.line > 0 ? `línea ${e.line}: ${e.message}` : e.message))
        .join(" · ")}`,
    };
  }

  // Skip what an earlier import already brought in.
  const ids = parsed.rows.map(csvRecordId);
  const existing = new Set<string>();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await supabase
      .from("metric_events")
      .select("external_record_id")
      .eq("metric_definition_id", target.id)
      .eq("source", "csv_import")
      .in("external_record_id", ids.slice(i, i + CHUNK));
    if (error) {
      logDatabaseError("check csv duplicates", error);
      return invalid(databaseErrorMessage(error));
    }
    for (const row of data)
      if (row.external_record_id) existing.add(row.external_record_id);
  }
  const fresh = parsed.rows.filter((row) => !existing.has(csvRecordId(row)));

  for (let i = 0; i < fresh.length; i += CHUNK) {
    const { error } = await supabase.from("metric_events").insert(
      fresh.slice(i, i + CHUNK).map((row) => ({
        metric_definition_id: target.id,
        occurred_at: localDateToInstant(row.date, timeZone, now).toISOString(),
        value_numeric: row.value,
        unit: target.unit,
        note: row.note,
        source: "csv_import",
        external_record_id: csvRecordId(row),
      })),
    );
    if (error) {
      logDatabaseError("import csv", error);
      return invalid(
        i === 0
          ? databaseErrorMessage(error)
          : `Se importaron ${i} valores y luego falló: ${databaseErrorMessage(error)} Vuelve a subir el archivo; lo ya importado no se duplica.`,
      );
    }
  }

  refresh();
  const skipped = parsed.rows.length - fresh.length;
  return {
    status: "success",
    message:
      fresh.length === 0
        ? "Todos los valores del archivo ya estaban importados."
        : `${fresh.length} valor(es) importados${skipped ? `; ${skipped} ya existían` : ""}.`,
  };
}
