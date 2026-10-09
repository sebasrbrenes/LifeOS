import { z } from "zod";

import { formatNumber, parseDecimal } from "@/lib/format";
import {
  parseMetricConfig,
  type LocalDate,
  type MetricDirection,
} from "@/lib/scoring";

import type { FieldErrors } from "./metric-form";

type MetricShape = {
  direction: MetricDirection;
  unit: string | null;
  config: unknown;
};

export type ValueFormValues = {
  value: number;
  date: LocalDate;
  note: string | null;
};

export type ValueFormResult =
  | { ok: true; values: ValueFormValues }
  | { ok: false; fieldErrors: FieldErrors };

const dateSchema = z
  .string({ error: "Elige una fecha." })
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Elige una fecha válida." })
  .refine(
    (value) => {
      const [year, month, day] = value.split("-").map(Number);
      const parsed = new Date(Date.UTC(year, month - 1, day));
      return (
        parsed.getUTCFullYear() === year &&
        parsed.getUTCMonth() === month - 1 &&
        parsed.getUTCDate() === day &&
        value >= "1900-01-01"
      );
    },
    { error: "Elige una fecha válida." },
  );

/**
 * Parses the "register a value" form. `today` is the user's local date:
 * values can be backdated but not entered for the future.
 */
export function parseValueForm(
  formData: FormData,
  metric: Pick<MetricShape, "direction">,
  today: LocalDate,
): ValueFormResult {
  const fieldErrors: FieldErrors = {};

  const date = dateSchema.safeParse(formData.get("date") ?? undefined);
  if (!date.success) {
    fieldErrors.date = date.error.issues[0]?.message;
  } else if (date.data > today) {
    fieldErrors.date = "No puedes registrar valores en el futuro.";
  }

  let value = parseDecimal(formData.get("value"));
  if (value === null) {
    fieldErrors.value = "Introduce un valor.";
  } else if (!Number.isFinite(value)) {
    fieldErrors.value = "Introduce un número (p. ej. 7,5).";
  } else if (metric.direction === "boolean" && value !== 0 && value !== 1) {
    fieldErrors.value = "Elige Sí o No.";
  } else if (metric.direction === "ratio") {
    value = value / 100; // entered as a percentage
  }

  const rawNote = formData.get("note");
  const note = typeof rawNote === "string" ? rawNote.trim() : "";
  if (note.length > 1000) fieldErrors.note = "Máximo 1000 caracteres.";

  if (Object.keys(fieldErrors).length > 0 || value === null || !date.success) {
    return { ok: false, fieldErrors };
  }
  return { ok: true, values: { value, date: date.data, note: note || null } };
}

function milestones(metric: MetricShape) {
  const parsed = parseMetricConfig(metric.direction, metric.config);
  return parsed.ok && parsed.value.direction === "milestone"
    ? parsed.value.config.milestones
    : [];
}

/** A value as the user thinks of it: "12 km", "Sí", "8 %", "Oferta". */
export function formatMetricValue(value: number, metric: MetricShape): string {
  switch (metric.direction) {
    case "boolean":
      return value > 0 ? "Sí" : "No";
    case "ratio":
      return `${formatNumber(value * 100, 1)} %`;
    case "milestone": {
      const reached = milestones(metric)
        .filter((m) => value >= m.value)
        .at(-1);
      return reached ? reached.label : formatNumber(value);
    }
    default:
      return metric.unit
        ? `${formatNumber(value)} ${metric.unit}`
        : formatNumber(value);
  }
}

/** The value as it should appear in an edit field. */
export function valueToInput(
  value: number,
  direction: MetricDirection,
): string {
  const shown = direction === "ratio" ? value * 100 : value;
  return String(Number(shown.toPrecision(12)));
}

/** One-line summary of what "100" means for a metric. */
export function describeTarget(metric: MetricShape): string {
  const parsed = parseMetricConfig(metric.direction, metric.config);
  if (!parsed.ok) return "Configuración no válida";
  const unit = metric.unit ? ` ${metric.unit}` : "";
  const n = (value: number) => formatNumber(value);
  switch (parsed.value.direction) {
    case "higher_is_better":
      return `Objetivo: ${n(parsed.value.config.target)}${unit} o más`;
    case "lower_is_better":
      return `Objetivo: ${n(parsed.value.config.target)}${unit} o menos`;
    case "target_range":
      return `Rango ideal: ${n(parsed.value.config.targetMin)}–${n(parsed.value.config.targetMax)}${unit}`;
    case "boolean":
      return "Objetivo: Sí";
    case "milestone": {
      const top = parsed.value.config.milestones.at(-1)!;
      return `Nivel máximo: ${top.label}`;
    }
    case "ratio":
      return `Objetivo: ${formatNumber(parsed.value.config.target * 100, 1)} %`;
    case "custom":
      return `Curva de ${parsed.value.config.points.length} puntos`;
  }
}
