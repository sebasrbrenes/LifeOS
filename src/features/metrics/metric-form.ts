import { z } from "zod";

import { parseDecimal } from "@/lib/format";
import {
  METRIC_AGGREGATIONS,
  METRIC_DIRECTIONS,
  METRIC_PERIODS,
  parseMetricConfig,
  type MetricAggregation,
  type MetricDirection,
  type MetricPeriod,
} from "@/lib/scoring";

/**
 * Turns the metric form into a definition + scoring config. Number fields
 * are parsed here (Spanish messages); the config's rules are checked by the
 * score engine's own schemas (`parseMetricConfig`) — not re-implemented.
 */

export type MetricFormValues = {
  name: string;
  categoryId: string;
  description: string | null;
  unit: string | null;
  direction: MetricDirection;
  period: MetricPeriod;
  aggregation: MetricAggregation;
  weight: number;
  config: Record<string, unknown>;
};

export type FieldErrors = Partial<Record<string, string>>;

export type MetricFormResult =
  | { ok: true; values: MetricFormValues }
  | { ok: false; fieldErrors: FieldErrors };

/** Form field that holds each config path (ratio targets are percentages). */
function fieldForConfigPath(direction: MetricDirection, path: string): string {
  if (direction === "ratio" && path === "target") return "ratioTarget";
  return path.split(".")[0] || "config";
}

/** Spanish copy for the engine's config refinement messages. */
const ENGINE_MESSAGES: Record<string, string> = {
  "target must be greater than baseline":
    "El objetivo debe ser mayor que el valor base.",
  "target must be positive, or worst must be greater than target":
    "El objetivo debe ser positivo, o el peor valor debe ser mayor que el objetivo.",
  "targetMax must be at least targetMin":
    "El máximo debe ser mayor o igual que el mínimo.",
  "a single-value range needs an explicit tolerance":
    "Si mínimo y máximo coinciden, indica una tolerancia.",
  "milestone values must be strictly increasing":
    "Los valores de los niveles deben ser distintos y de menor a mayor.",
  "point values must be strictly increasing":
    "Los valores de los puntos deben ser distintos y de menor a mayor.",
  "numerator and denominator must be set together":
    "Elige numerador y denominador, o ninguno.",
};

const baseSchema = z.object({
  name: z
    .string({ error: "Ponle un nombre." })
    .trim()
    .min(1, { error: "Ponle un nombre." })
    .max(80, { error: "Máximo 80 caracteres." }),
  categoryId: z.uuid({ error: "Elige una categoría." }),
  description: z
    .string()
    .trim()
    .max(500, { error: "Máximo 500 caracteres." })
    .optional()
    .transform((value) => value || null),
  unit: z
    .string()
    .trim()
    .max(20, { error: "Máximo 20 caracteres." })
    .optional()
    .transform((value) => value || null),
  direction: z.enum(METRIC_DIRECTIONS, { error: "Elige cómo se puntúa." }),
  period: z.enum(METRIC_PERIODS, { error: "Elige un periodo." }),
  aggregation: z.enum(METRIC_AGGREGATIONS, {
    error: "Elige cómo se combinan los registros.",
  }),
  emptyWindow: z.enum(["", "zero", "missing"]).optional(),
});

type NumberRule = {
  required?: boolean;
  min?: number;
  max?: number;
  integer?: boolean;
};

class ConfigReader {
  readonly errors: FieldErrors = {};
  constructor(private readonly formData: FormData) {}

  string(field: string): string {
    const raw = this.formData.get(field);
    return typeof raw === "string" ? raw.trim() : "";
  }

  number(field: string, rule: NumberRule = {}): number | undefined {
    const value = parseDecimal(this.formData.get(field));
    if (value === null) {
      if (rule.required) this.errors[field] ??= "Este campo es obligatorio.";
      return undefined;
    }
    if (!Number.isFinite(value)) {
      this.errors[field] ??= "Introduce un número (p. ej. 7,5).";
      return undefined;
    }
    if (rule.min !== undefined && value < rule.min) {
      this.errors[field] ??= `Debe ser al menos ${rule.min}.`;
    } else if (rule.max !== undefined && value > rule.max) {
      this.errors[field] ??= `No puede superar ${rule.max}.`;
    }
    return value;
  }

  /** Rows named `${prefix}.${i}.${column}`, in index order, skipping blank rows. */
  rows(prefix: string): Map<string, string>[] {
    const byIndex = new Map<number, Map<string, string>>();
    for (const [name, raw] of this.formData.entries()) {
      const match = new RegExp(`^${prefix}\\.(\\d+)\\.(\\w+)$`).exec(name);
      if (!match || typeof raw !== "string") continue;
      const index = Number(match[1]);
      const row = byIndex.get(index) ?? new Map<string, string>();
      row.set(match[2], raw.trim());
      byIndex.set(index, row);
    }
    return [...byIndex.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, row]) => row)
      .filter((row) => [...row.values()].some((value) => value !== ""));
  }
}

function readConfig(
  direction: MetricDirection,
  read: ConfigReader,
): Record<string, unknown> {
  switch (direction) {
    case "higher_is_better":
      return {
        target: read.number("target", { required: true }),
        baseline: read.number("baseline"),
      };
    case "lower_is_better":
      return {
        target: read.number("target", { required: true }),
        worst: read.number("worst"),
      };
    case "target_range":
      return {
        targetMin: read.number("targetMin", { required: true }),
        targetMax: read.number("targetMax", { required: true }),
        tolerance: read.number("tolerance", { min: 0 }),
      };
    case "boolean":
      return {};
    case "ratio": {
      const percent = read.number("ratioTarget", { required: true, min: 0 });
      const numerator = read.string("numerator") || undefined;
      const denominator = read.string("denominator") || undefined;
      return {
        target: percent === undefined ? undefined : percent / 100,
        numerator,
        denominator,
        minDenominator:
          numerator || denominator
            ? read.number("minDenominator", { min: 0 })
            : undefined,
      };
    }
    case "milestone": {
      const rows = read.rows("milestones");
      if (rows.length === 0)
        read.errors.milestones = "Añade al menos un nivel.";
      return {
        milestones: rows.map((row, index) => {
          const value = parseDecimal(row.get("value"));
          const score = parseDecimal(row.get("score"));
          const label = row.get("label") ?? "";
          if (
            value === null ||
            score === null ||
            !label ||
            !Number.isFinite(value) ||
            !Number.isFinite(score)
          ) {
            read.errors.milestones ??= `Completa el nivel ${index + 1}: valor, puntuación y nombre.`;
          } else if (score < 0 || score > 100) {
            read.errors.milestones ??= "Las puntuaciones van de 0 a 100.";
          }
          return { value, score, label };
        }),
      };
    }
    case "custom": {
      const rows = read.rows("points");
      if (rows.length < 2) read.errors.points = "Añade al menos dos puntos.";
      return {
        points: rows.map((row, index) => {
          const value = parseDecimal(row.get("value"));
          const score = parseDecimal(row.get("score"));
          if (
            value === null ||
            score === null ||
            !Number.isFinite(value) ||
            !Number.isFinite(score)
          ) {
            read.errors.points ??= `Completa el punto ${index + 1}.`;
          } else if (score < 0 || score > 100) {
            read.errors.points ??= "Las puntuaciones van de 0 a 100.";
          }
          return { value, score };
        }),
      };
    }
  }
}

function withoutUndefined(
  config: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(config).filter(([, value]) => value !== undefined),
  );
}

export function parseMetricForm(formData: FormData): MetricFormResult {
  const raw = Object.fromEntries(
    [...formData.entries()].filter(
      ([key, value]) => typeof value === "string" && !key.startsWith("$"),
    ),
  );
  const base = baseSchema.safeParse(raw);
  const fieldErrors: FieldErrors = {};
  if (!base.success) {
    for (const issue of base.error.issues) {
      fieldErrors[String(issue.path[0] ?? "form")] ??= issue.message;
    }
  }

  const reader = new ConfigReader(formData);
  const weight = reader.number("weight", { required: true, min: 0, max: 100 });
  const direction = base.success ? base.data.direction : null;
  const config = direction ? readConfig(direction, reader) : {};
  for (const [field, message] of Object.entries(reader.errors)) {
    fieldErrors[field] ??= message;
  }

  if (
    !base.success ||
    direction === null ||
    weight === undefined ||
    Object.keys(fieldErrors).length > 0
  ) {
    return { ok: false, fieldErrors };
  }

  const emptyWindow = base.data.emptyWindow || undefined;
  const candidate = withoutUndefined({ ...config, emptyWindow });
  const parsed = parseMetricConfig(direction, candidate);
  if (!parsed.ok) {
    for (const error of parsed.errors) {
      const separator = error.indexOf(": ");
      const path = error.slice(0, separator);
      const message = error.slice(separator + 2);
      fieldErrors[fieldForConfigPath(direction, path)] ??=
        ENGINE_MESSAGES[message] ?? "Revisa este valor.";
    }
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    values: {
      name: base.data.name,
      categoryId: base.data.categoryId,
      description: base.data.description,
      unit: base.data.unit,
      direction,
      period: base.data.period,
      aggregation: base.data.aggregation,
      weight,
      // Store what the user entered; defaults are applied at scoring time.
      config: candidate,
    },
  };
}

/** Form field values (strings) for editing an existing metric. */
export function metricFormDefaults(metric: {
  direction: MetricDirection;
  config: unknown;
}): Record<string, string> {
  const config = (metric.config ?? {}) as Record<string, unknown>;
  const text = (value: unknown) =>
    typeof value === "number"
      ? String(value)
      : typeof value === "string"
        ? value
        : "";
  const defaults: Record<string, string> = {
    emptyWindow: text(config.emptyWindow),
  };
  for (const field of [
    "target",
    "baseline",
    "worst",
    "targetMin",
    "targetMax",
    "tolerance",
    "numerator",
    "denominator",
    "minDenominator",
  ]) {
    defaults[field] = text(config[field]);
  }
  if (metric.direction === "ratio" && typeof config.target === "number") {
    defaults.ratioTarget = String(
      Number((config.target * 100).toPrecision(12)),
    );
    defaults.target = "";
  }
  return defaults;
}
