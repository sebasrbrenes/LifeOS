import type {
  Freshness,
  MetricAggregation,
  MetricDirection,
  MetricPeriod,
  MetricSource,
} from "@/lib/scoring";

/** Spanish copy for the scoring vocabularies. */

export const DIRECTION_LABELS: Record<
  MetricDirection,
  { label: string; hint: string }
> = {
  higher_is_better: {
    label: "Más es mejor",
    hint: "Ahorros, km recorridos, clientes, aplicaciones…",
  },
  lower_is_better: {
    label: "Menos es mejor",
    hint: "Tiempo en 5K, deuda, gasto innecesario…",
  },
  target_range: {
    label: "Rango ideal",
    hint: "Horas de sueño, peso: dentro del rango puntúa 100.",
  },
  boolean: {
    label: "Sí / No",
    hint: "Revisión semanal hecha, presupuesto respetado…",
  },
  milestone: {
    label: "Niveles",
    hint: "Etapas que se alcanzan, p. ej. de “aprendiendo” a “trabajo conseguido”.",
  },
  ratio: {
    label: "Porcentaje",
    hint: "Tasa de respuesta, tasa de ahorro… Puede calcularse de otras dos métricas.",
  },
  custom: {
    label: "Curva personalizada",
    hint: "Defines a mano qué puntuación corresponde a cada valor.",
  },
};

export const PERIOD_LABELS: Record<MetricPeriod, string> = {
  daily: "Hoy",
  weekly: "Últimos 7 días",
  monthly: "Últimos 30 días",
  quarterly: "Últimos 91 días",
  yearly: "Últimos 365 días",
  all_time: "Todo el historial",
};

export const AGGREGATION_LABELS: Record<
  MetricAggregation,
  { label: string; hint: string }
> = {
  sum: { label: "Suma", hint: "Total de los registros (km, minutos, €…)." },
  avg: { label: "Media", hint: "Promedio de los registros (horas de sueño…)." },
  min: { label: "Mínimo", hint: "El registro más bajo." },
  max: { label: "Máximo", hint: "El registro más alto." },
  latest: {
    label: "Último valor",
    hint: "El registro más reciente (saldo, peso, nivel…).",
  },
  count: {
    label: "Nº de registros",
    hint: "Cuántas veces registraste algo (sesiones, entrenos…).",
  },
};

export const SOURCE_LABELS: Record<MetricSource, string> = {
  manual: "Manual",
  strava: "Strava",
  google_calendar: "Google Calendar",
  github: "GitHub",
  google_health: "Google Health",
  csv_import: "Importación CSV",
  internal: "Life OS",
  computed: "Calculado",
};

export const FRESHNESS_LABELS: Record<Freshness, string> = {
  fresh: "Al día",
  delayed: "Con retraso",
  stale: "Desactualizado",
  missing: "Sin datos",
  error: "Error",
};
