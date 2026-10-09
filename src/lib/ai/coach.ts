import { z } from "zod";

import type { CategoryDiagnostic, WeeklyReviewSummary } from "@/lib/scoring";

/**
 * AI coach (spec §30): an analysis layer over a closed week's stored
 * review. It receives structured values only, writes prose, and must not
 * invent measurements — every number it writes is checked against what
 * it was given (`findUnsupportedNumbers`) before anything is saved.
 */

const r1 = (value: number | null) =>
  value === null ? null : Math.round(value * 10) / 10 + 0;

export type CoachCommitment = {
  title: string;
  target: number;
  done: number;
  completed: boolean;
  cancelled: boolean;
};

export type CoachPayload = ReturnType<typeof buildCoachPayload>;

/** The exact data sent to the model — also shown to the user. */
export function buildCoachPayload({
  weekStart,
  weekEnd,
  mainGoal,
  summary,
  commitments,
  alerts,
}: {
  weekStart: string;
  weekEnd: string;
  mainGoal: string | null;
  summary: WeeklyReviewSummary;
  commitments: CoachCommitment[];
  alerts: CategoryDiagnostic[];
}) {
  return {
    week: { start: weekStart, end: weekEnd },
    mainGoal,
    lifeScore: {
      start: r1(summary.lifeScore.start),
      end: r1(summary.lifeScore.end),
      change: r1(summary.lifeScore.delta),
    },
    weekScore: r1(summary.weekScore),
    commitmentCompletion: {
      completed: summary.execution.completed,
      total: summary.execution.total,
      ratePercent:
        summary.execution.rate === null
          ? null
          : Math.round(summary.execution.rate * 100),
    },
    categories: summary.categories.map((c) => ({
      name: c.name,
      start: r1(c.start),
      end: r1(c.end),
      change: r1(c.delta),
    })),
    biggestGain: summary.biggestGain
      ? {
          name: summary.biggestGain.name,
          change: r1(summary.biggestGain.delta),
        }
      : null,
    biggestDecline: summary.biggestDecline
      ? {
          name: summary.biggestDecline.name,
          change: r1(summary.biggestDecline.delta),
        }
      : null,
    strongestCategory: summary.strongest?.name ?? null,
    weakestCategory: summary.weakest?.name ?? null,
    bottleneck: summary.bottleneck
      ? {
          metric: summary.bottleneck.name,
          category: summary.bottleneck.categoryName,
          score: r1(summary.bottleneck.score),
          lifeScorePointsIfOnTarget: r1(summary.bottleneck.potentialGain),
        }
      : null,
    metricsOffTarget: summary.offTarget.map((m) => ({
      metric: m.name,
      category: m.categoryName,
      score: r1(m.score),
    })),
    metricsImproving: summary.improvingFastest.map((m) => ({
      metric: m.name,
      change: r1(m.delta),
    })),
    metricsStagnantDespiteExecution: summary.stagnantDespiteExecution.map(
      (m) => ({ metric: m.name, change: r1(m.delta) }),
    ),
    commitments: commitments.map((c) => ({
      title: c.title,
      target: c.target,
      done: c.done,
      completed: c.completed,
      cancelled: c.cancelled,
    })),
    alerts: alerts.map((a) => ({
      type: a.code,
      category: a.categoryName,
      executionPercent: Math.round(a.execution),
      categoryChange: r1(a.outcomeChange),
    })),
  };
}

export const COACH_SYSTEM_PROMPT = `Eres el coach de Life OS, un sistema personal de métricas. Analizas la revisión semanal de una persona a partir de datos estructurados.

Reglas:
- Usa SOLO los datos recibidos. No inventes mediciones, cifras, fechas ni hechos. Si mencionas un número, debe aparecer en los datos.
- Life Score mide el estado (resultados); Week Score mide la ejecución (compromisos). Nunca los combines en una sola cifra.
- No hagas diagnósticos médicos ni psicológicos. Es analítica de producto.
- Sé concreto y breve, en español, en segunda persona ("tú").
- Si faltan datos para una conclusión, dilo en vez de suponer.

Responde únicamente con la herramienta weekly_coach.`;

/** Tool schema the model must fill (JSON Schema for the API). */
export const COACH_TOOL = {
  name: "weekly_coach",
  description: "Análisis semanal estructurado para el usuario.",
  input_schema: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description: "Resumen de la semana en 2–4 frases.",
      },
      bottleneck: {
        type: "string",
        description: "Explicación del principal cuello de botella.",
      },
      focus: {
        type: "string",
        description: "Foco recomendado para la próxima semana.",
      },
      questions: {
        type: "array",
        items: { type: "string" },
        description: "2–4 preguntas de reflexión.",
      },
    },
    required: ["summary", "bottleneck", "focus", "questions"],
  },
} as const;

export const coachInsightSchema = z.strictObject({
  summary: z.string().trim().min(1).max(1500),
  bottleneck: z.string().trim().min(1).max(1000),
  focus: z.string().trim().min(1).max(1000),
  questions: z.array(z.string().trim().min(1).max(300)).min(1).max(5),
});

export type CoachInsight = z.infer<typeof coachInsightSchema>;

const NUMBER = /-?\d+(?:[.,]\d+)?/g;

function numbersIn(text: string): number[] {
  return (text.match(NUMBER) ?? []).map((n) => Number(n.replace(",", ".")));
}

/** Every number present in the payload, in the forms prose may use. */
function allowedNumbers(payload: unknown): Set<number> {
  const allowed = new Set<number>();
  const add = (value: number) => {
    for (const v of [value, Math.abs(value)]) {
      allowed.add(Math.round(v * 10) / 10);
      allowed.add(Math.round(v));
      allowed.add(Math.floor(v));
    }
  };
  const visit = (value: unknown) => {
    if (typeof value === "number") add(value);
    else if (typeof value === "string") numbersIn(value).forEach(add);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object")
      Object.values(value).forEach(visit);
  };
  visit(payload);
  // Small counts ("dos compromisos", "3 preguntas") and the 0–100 scale.
  for (let i = 0; i <= 10; i += 1) allowed.add(i);
  allowed.add(100);
  return allowed;
}

/**
 * Numbers in the insight that don't come from the payload. Non-empty
 * means the model invented a measurement: the insight is not saved.
 */
export function findUnsupportedNumbers(
  insight: CoachInsight,
  payload: unknown,
): number[] {
  const allowed = allowedNumbers(payload);
  const text = [
    insight.summary,
    insight.bottleneck,
    insight.focus,
    ...insight.questions,
  ].join("\n");
  return [
    ...new Set(
      numbersIn(text).filter((n) => !allowed.has(Math.round(n * 10) / 10)),
    ),
  ];
}
