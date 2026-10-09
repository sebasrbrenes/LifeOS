import type { MetricAggregation } from "@/lib/scoring";

import type { IntegrationProvider } from "./types";

/**
 * Canonical source metrics each adapter can produce. A Life OS metric
 * links to one of these (metric_definitions.source_metric); its own
 * period, aggregation and target then decide how the values score.
 */
export type SourceMetricDefinition = {
  key: string;
  provider: IntegrationProvider;
  label: string;
  unit: string | null;
  /** Aggregation that makes sense for one value per item. */
  suggestedAggregation: MetricAggregation;
};

export const SOURCE_METRICS: readonly SourceMetricDefinition[] = [
  {
    key: "strava.run_distance_km",
    provider: "strava",
    label: "Distancia corriendo",
    unit: "km",
    suggestedAggregation: "sum",
  },
  {
    key: "strava.run_count",
    provider: "strava",
    label: "Salidas a correr",
    unit: "salidas",
    suggestedAggregation: "sum",
  },
  {
    key: "strava.ride_distance_km",
    provider: "strava",
    label: "Distancia en bici",
    unit: "km",
    suggestedAggregation: "sum",
  },
  {
    key: "strava.activity_count",
    provider: "strava",
    label: "Actividades (todas)",
    unit: "actividades",
    suggestedAggregation: "sum",
  },
  {
    key: "strava.moving_minutes",
    provider: "strava",
    label: "Minutos en movimiento",
    unit: "min",
    suggestedAggregation: "sum",
  },
  {
    key: "strava.elevation_gain_m",
    provider: "strava",
    label: "Desnivel positivo",
    unit: "m",
    suggestedAggregation: "sum",
  },
  {
    key: "google_calendar.planned_minutes",
    provider: "google_calendar",
    label: "Minutos planificados en el calendario",
    unit: "min",
    suggestedAggregation: "sum",
  },
  {
    key: "google_calendar.planned_blocks",
    provider: "google_calendar",
    label: "Bloques planificados en el calendario",
    unit: "bloques",
    suggestedAggregation: "sum",
  },
];

export function sourceMetric(key: string): SourceMetricDefinition | null {
  return SOURCE_METRICS.find((metric) => metric.key === key) ?? null;
}
