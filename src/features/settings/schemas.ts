import { z } from "zod";

import { parseDecimal } from "@/lib/format";
import { isValidTimeZone } from "@/lib/scoring";

import type { FieldErrors } from "../metrics/metric-form";

/** Weights are edited with at most one decimal; totals compare in tenths. */
const toTenths = (value: number) => Math.round(value * 10);

export type CategorySetting = {
  id: string;
  name: string;
  weight: number;
  enabled: boolean;
};

export type CategorySettingsResult =
  | { ok: true; categories: CategorySetting[] }
  | { ok: false; fieldErrors: FieldErrors; formError?: string };

/**
 * Parses the category editor (`categories.<i>.id|name|weight|enabled`).
 * Enabled weights must total exactly 100 (FR-003); disabled categories are
 * saved with weight 0. The database re-checks inside the same transaction.
 */
export function parseCategorySettings(
  formData: FormData,
  knownIds: ReadonlySet<string>,
): CategorySettingsResult {
  const rows = new Map<number, Map<string, string>>();
  for (const [name, raw] of formData.entries()) {
    const match = /^categories\.(\d+)\.(id|name|weight|enabled)$/.exec(name);
    if (!match || typeof raw !== "string") continue;
    const row = rows.get(Number(match[1])) ?? new Map<string, string>();
    row.set(match[2], raw.trim());
    rows.set(Number(match[1]), row);
  }

  const fieldErrors: FieldErrors = {};
  const categories: CategorySetting[] = [];
  for (const [index, row] of [...rows.entries()].sort(([a], [b]) => a - b)) {
    const id = row.get("id") ?? "";
    if (!knownIds.has(id)) {
      return { ok: false, fieldErrors, formError: "Categoría desconocida." };
    }
    const name = row.get("name") ?? "";
    if (name.length < 1 || name.length > 60) {
      fieldErrors[`categories.${index}.name`] = "Entre 1 y 60 caracteres.";
    }
    const enabled =
      row.get("enabled") === "on" || row.get("enabled") === "true";
    const weight = enabled ? parseDecimal(row.get("weight")) : 0;
    if (enabled) {
      if (weight === null || !Number.isFinite(weight)) {
        fieldErrors[`categories.${index}.weight`] = "Introduce un número.";
      } else if (weight < 0 || weight > 100) {
        fieldErrors[`categories.${index}.weight`] = "Entre 0 y 100.";
      } else if (toTenths(weight) !== weight * 10) {
        fieldErrors[`categories.${index}.weight`] = "Como máximo un decimal.";
      }
    }
    categories.push({ id, name, weight: weight ?? 0, enabled });
  }

  if (categories.length === 0) {
    return {
      ok: false,
      fieldErrors,
      formError: "No hay categorías que guardar.",
    };
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  const enabled = categories.filter((c) => c.enabled);
  if (enabled.length === 0) {
    return {
      ok: false,
      fieldErrors,
      formError: "Activa al menos una categoría.",
    };
  }
  const total = enabled.reduce((sum, c) => sum + toTenths(c.weight), 0) / 10;
  if (total !== 100) {
    return {
      ok: false,
      fieldErrors,
      formError: `Los pesos de las categorías activas deben sumar 100 % (ahora suman ${total} %).`,
    };
  }
  return { ok: true, categories };
}

export const profileSettingsSchema = z.object({
  displayName: z
    .string()
    .trim()
    .max(80, { error: "Máximo 80 caracteres." })
    .transform((value) => value || null),
  timezone: z
    .string({ error: "Elige una zona horaria." })
    .refine(isValidTimeZone, { error: "Zona horaria no válida." }),
  weekStartsOn: z.coerce
    .number()
    .int()
    .min(0, { error: "Día no válido." })
    .max(6, { error: "Día no válido." }),
});

export const mainGoalSchema = z.object({
  title: z
    .string({ error: "Describe tu objetivo principal." })
    .trim()
    .min(1, { error: "Describe tu objetivo principal." })
    .max(200, { error: "Máximo 200 caracteres." }),
  categoryId: z
    .union([z.literal(""), z.uuid()])
    .transform((value) => value || null),
  targetDate: z
    .union([z.literal(""), z.iso.date({ error: "Fecha no válida." })])
    .transform((value) => value || null),
});
