import "server-only";

import { z } from "zod";

import {
  METRIC_SOURCES,
  daysBetween,
  localDate,
  parseMetricConfig,
  type MetricDirection,
  type WeightedMetric,
} from "@/lib/scoring";
import { formatLocalDate } from "@/lib/format";
import { fetchAllRows } from "@/lib/supabase/paginate";
import { createClient } from "@/lib/supabase/server";

import { loadScoringOverview } from "../scores/data";
import { toMetricInput, type MetricRow } from "../scores/mappers";
import type { HistoryEntry } from "./components/value-history";
import type { ValueMetric } from "./components/value-form";
import { SOURCE_LABELS } from "./labels";
import { formatMetricValue, valueToInput } from "./values";

type EventHistoryRow = {
  id: string;
  occurred_at: string;
  value_numeric: number | null;
  note: string | null;
  source: string;
};

export type MetricDetail = {
  metric: MetricRow;
  categoryName: string;
  categoryEnabled: boolean;
  score: WeightedMetric | null;
  valueMetric: ValueMetric;
  history: HistoryEntry[];
  today: string;
  lastEntryDaysAgo: number | null;
};

/** One metric with its score and full history, or null if not the user's. */
export async function loadMetricDetail(
  metricId: string,
): Promise<MetricDetail | null> {
  if (!z.uuid().safeParse(metricId).success) return null;
  const overview = await loadScoringOverview();
  const metric = overview.metrics.find((m) => m.id === metricId);
  if (!metric) return null;

  const supabase = await createClient();
  const rows = await fetchAllRows<EventHistoryRow>((from, to) =>
    supabase
      .from("metric_events")
      .select("id, occurred_at, value_numeric, note, source")
      .eq("metric_definition_id", metricId)
      .order("occurred_at", { ascending: false })
      .order("id")
      .range(from, to),
  );

  const input = toMetricInput(metric);
  const shape = {
    direction: input.direction,
    unit: metric.unit,
    config: metric.config,
  };
  const parsed = parseMetricConfig(input.direction, metric.config);
  const milestones =
    parsed.ok && parsed.value.direction === "milestone"
      ? parsed.value.config.milestones.map(({ value, label }) => ({
          value,
          label,
        }))
      : [];
  const timeZone = overview.profile.timezone;
  const category = overview.categories.find((c) => c.id === metric.category_id);
  const score =
    overview.life.categories
      .flatMap((c) => c.metrics)
      .find((m) => m.metricId === metricId) ?? null;

  const history: HistoryEntry[] = rows.map((row) => {
    const date = localDate(new Date(row.occurred_at), timeZone);
    const source = METRIC_SOURCES.find((s) => s === row.source) ?? "manual";
    return {
      id: row.id,
      date,
      dateLabel: formatLocalDate(date),
      valueLabel:
        row.value_numeric === null
          ? "—"
          : formatMetricValue(Number(row.value_numeric), shape),
      valueInput:
        row.value_numeric === null
          ? ""
          : valueToInput(Number(row.value_numeric), input.direction),
      note: row.note,
      sourceLabel: SOURCE_LABELS[source],
      editable: source === "manual" || source === "csv_import",
    };
  });

  return {
    metric,
    categoryName: category?.name ?? "Sin categoría",
    categoryEnabled: category?.enabled ?? false,
    score,
    valueMetric: {
      direction: input.direction as MetricDirection,
      unit: metric.unit,
      milestones,
    },
    history,
    today: overview.today,
    lastEntryDaysAgo: history[0]
      ? daysBetween(history[0].date, overview.today)
      : null,
  };
}
