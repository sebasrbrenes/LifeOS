import { parseDecimal } from "@/lib/format";
import type { CommitmentCompletionType } from "@/lib/scoring";

import type { FieldErrors } from "../metrics/metric-form";

export const MAX_COMMITMENT_TARGET = 1_000_000;

export type CommitmentFormValues = {
  title: string;
  categoryId: string | null;
  completionType: CommitmentCompletionType;
  targetValue: number;
  unit: string | null;
  weight: number;
};

export type CommitmentFormResult =
  | { ok: true; values: CommitmentFormValues }
  | { ok: false; fieldErrors: FieldErrors };

function text(formData: FormData, name: string): string {
  const raw = formData.get(name);
  return typeof raw === "string" ? raw.trim() : "";
}

/**
 * Parses the commitment form. `categoryIds` are the user's own categories;
 * any other id is rejected here rather than by a foreign-key error.
 */
export function parseCommitmentForm(
  formData: FormData,
  categoryIds: ReadonlySet<string>,
): CommitmentFormResult {
  const fieldErrors: FieldErrors = {};

  const title = text(formData, "title");
  if (title.length === 0) fieldErrors.title = "Describe el compromiso.";
  else if (title.length > 200) fieldErrors.title = "Máximo 200 caracteres.";

  const rawCategory = text(formData, "categoryId");
  const categoryId = rawCategory === "" ? null : rawCategory;
  if (categoryId !== null && !categoryIds.has(categoryId))
    fieldErrors.categoryId = "Elige una categoría válida.";

  const rawType = text(formData, "completionType");
  const completionType: CommitmentCompletionType | null =
    rawType === "boolean" || rawType === "quantity" ? rawType : null;
  if (!completionType) fieldErrors.completionType = "Elige un tipo.";

  let targetValue = 1;
  let unit: string | null = null;
  if (completionType === "quantity") {
    const target = parseDecimal(formData.get("targetValue"));
    if (target === null) fieldErrors.targetValue = "Indica el objetivo.";
    else if (!Number.isFinite(target))
      fieldErrors.targetValue = "Introduce un número (p. ej. 3 o 7,5).";
    else if (target <= 0) fieldErrors.targetValue = "Debe ser mayor que 0.";
    else if (target > MAX_COMMITMENT_TARGET)
      fieldErrors.targetValue = "Es demasiado grande.";
    else targetValue = target;

    unit = text(formData, "unit") || null;
    if (unit && unit.length > 20) fieldErrors.unit = "Máximo 20 caracteres.";
  }

  const rawWeight = parseDecimal(formData.get("weight"));
  const weight = rawWeight ?? 1;
  if (!Number.isFinite(weight))
    fieldErrors.weight = "Introduce un número (p. ej. 1 o 2).";
  else if (weight <= 0 || weight > 100)
    fieldErrors.weight = "Entre 0 (sin incluir) y 100.";

  if (Object.keys(fieldErrors).length > 0 || !completionType) {
    return { ok: false, fieldErrors };
  }
  return {
    ok: true,
    values: { title, categoryId, completionType, targetValue, unit, weight },
  };
}

/**
 * Validates a new progress value. Boolean commitments are 0 or 1; quantity
 * commitments accept any non-negative amount (going over the target is
 * allowed, it just doesn't add score).
 */
export function parseProgress(
  value: unknown,
  completionType: CommitmentCompletionType,
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (completionType === "boolean")
    return value === 0 || value === 1 ? value : null;
  if (value < 0 || value > MAX_COMMITMENT_TARGET) return null;
  // The column stores up to the precision users type; avoid float noise.
  return Math.round(value * 1000) / 1000;
}
