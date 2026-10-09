import {
  parseSourceFilter,
  type SourceFilter,
} from "@/lib/integrations/reconcile";
import { sourceMetric } from "@/lib/integrations/source-metrics";

import type { FieldErrors } from "./metric-form";

/**
 * "Origen de los datos" form: manual entry, or a canonical provider metric
 * plus an optional filter. Provider values add to manual ones; the UI
 * warns against logging the same thing twice.
 */

export type SourceFormValues =
  | { source: "manual"; sourceMetric: null; sourceFilter: SourceFilter }
  | {
      source: "strava" | "google_calendar";
      sourceMetric: string;
      sourceFilter: SourceFilter;
    };

function list(raw: FormDataEntryValue | null): string[] | undefined {
  if (typeof raw !== "string") return undefined;
  const items = raw
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? [...new Set(items)] : undefined;
}

export function parseSourceForm(
  formData: FormData,
):
  | { ok: true; values: SourceFormValues }
  | { ok: false; fieldErrors: FieldErrors } {
  const raw = formData.get("sourceMetric");
  const key = typeof raw === "string" ? raw : "";
  if (key === "" || key === "manual")
    return {
      ok: true,
      values: { source: "manual", sourceMetric: null, sourceFilter: {} },
    };

  const definition = sourceMetric(key);
  if (!definition)
    return {
      ok: false,
      fieldErrors: { sourceMetric: "Elige un origen de la lista." },
    };

  const title = formData.get("titleContains");
  const filter = parseSourceFilter(
    definition.provider === "strava"
      ? { sportTypes: list(formData.get("sportTypes")) }
      : {
          calendarIds: list(formData.get("calendarIds")),
          titleContains:
            typeof title === "string" && title.trim()
              ? title.trim()
              : undefined,
        },
  );
  if (!filter)
    return {
      ok: false,
      fieldErrors: { sourceFilter: "Revisa el filtro: es demasiado largo." },
    };

  return {
    ok: true,
    values: {
      source: definition.provider,
      sourceMetric: definition.key,
      sourceFilter: JSON.parse(JSON.stringify(filter)) as SourceFilter,
    },
  };
}
