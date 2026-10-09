import { formatNumber, formatShare } from "@/lib/format";
import type { ScoreIssue } from "@/lib/scoring";

import { SOURCE_LABELS } from "../metrics/labels";

export type IssueTone = "info" | "warning";

/**
 * Spanish explanation for each engine issue code (ADR-017). The switch is
 * exhaustive: adding a code to the engine fails the typecheck until it has
 * copy here.
 */
export function describeIssue(issue: ScoreIssue): {
  tone: IssueTone;
  text: string;
} {
  switch (issue.code) {
    case "invalid_config":
      return {
        tone: "warning",
        text: "La configuración de puntuación no es válida; esta métrica no puntúa hasta corregirla.",
      };
    case "source_unavailable":
      return {
        tone: "warning",
        text: `${SOURCE_LABELS[issue.source]} no está disponible; la métrica queda sin datos en vez de contar como 0.`,
      };
    case "never_recorded":
      return { tone: "info", text: "Todavía no hay registros." };
    case "no_data_in_window":
      return { tone: "info", text: "No hay registros en el periodo evaluado." };
    case "empty_window_counted_as_zero":
      return {
        tone: "info",
        text: "Sin registros en el periodo: cuenta como 0 porque ya registraste antes.",
      };
    case "insufficient_sample":
      return {
        tone: "info",
        text: `Muestra insuficiente: ${formatNumber(issue.denominator)} de ${formatNumber(issue.minDenominator)} necesarios.`,
      };
    case "unknown_ratio_metric":
      return {
        tone: "warning",
        text: `El porcentaje usa una métrica que ya no existe (${issue.key}).`,
      };
    case "duplicate_events_ignored":
      return {
        tone: "info",
        text: `${issue.count} registro(s) duplicado(s) ignorado(s).`,
      };
    case "events_without_value_ignored":
      return {
        tone: "info",
        text: `${issue.count} registro(s) sin valor numérico ignorado(s).`,
      };
    case "future_events_ignored":
      return {
        tone: "info",
        text: `${issue.count} registro(s) con fecha futura ignorado(s).`,
      };
    case "overperformance_capped":
      return {
        tone: "info",
        text: `Por encima del objetivo (${formatNumber(issue.rawScore, 0)}): la puntuación se limita a 100.`,
      };
    case "underperformance_floored":
      return {
        tone: "info",
        text: "Por debajo del mínimo: la puntuación se limita a 0.",
      };
    case "dominant_metric":
      return {
        tone: "warning",
        text: `Una métrica concentra el ${formatShare(issue.share)} del peso de la categoría.`,
      };
    case "no_weighted_items":
      return {
        tone: "warning",
        text: "Todos los pesos son 0; no se puede calcular.",
      };
    case "metrics_without_category":
      return {
        tone: "warning",
        text: `Métricas sin categoría válida: ${issue.metricKeys.join(", ")}.`,
      };
  }
}
