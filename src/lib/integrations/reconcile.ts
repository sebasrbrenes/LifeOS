import { z } from "zod";

import type { NormalizedRecord } from "./types";

/**
 * Turns a provider's records for a time window into the exact changes to
 * apply to metric_events, so a sync can run any number of times and the
 * stored values always mirror the provider (spec §17: never count an
 * activity twice).
 */

/** Which records count for a metric (metric_definitions.source_filter). */
export const sourceFilterSchema = z
  .strictObject({
    /** Strava sport types, e.g. ["Run", "TrailRun"]. */
    sportTypes: z.array(z.string().min(1).max(40)).max(30).optional(),
    /** Calendar ids to read (default: all the user's calendars read). */
    calendarIds: z.array(z.string().min(1).max(200)).max(30).optional(),
    /** Case-insensitive substring of the event title. */
    titleContains: z.string().trim().min(1).max(80).optional(),
  })
  .default({});

export type SourceFilter = z.infer<typeof sourceFilterSchema>;

export function parseSourceFilter(raw: unknown): SourceFilter | null {
  const parsed = sourceFilterSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : null;
}

export function matchesFilter(
  record: NormalizedRecord,
  filter: SourceFilter,
): boolean {
  const { sportType, calendarId, title } = record.attributes;
  if (filter.sportTypes && !filter.sportTypes.includes(sportType ?? ""))
    return false;
  if (filter.calendarIds && !filter.calendarIds.includes(calendarId ?? ""))
    return false;
  if (
    filter.titleContains &&
    !(title ?? "")
      .toLocaleLowerCase("es")
      .includes(filter.titleContains.toLocaleLowerCase("es"))
  )
    return false;
  return true;
}

export type LinkedMetric = {
  id: string;
  sourceMetric: string;
  /** Raw source_filter; an invalid one makes the metric receive nothing. */
  sourceFilter: unknown;
};

export type StoredEvent = {
  id: string;
  metricDefinitionId: string;
  externalRecordId: string;
  value: number | null;
  occurredAt: Date;
};

export type EventWrite = {
  metricDefinitionId: string;
  externalRecordId: string;
  value: number;
  occurredAt: Date;
};

export type ReconcilePlan = {
  inserts: EventWrite[];
  updates: (EventWrite & { id: string })[];
  /** Stored events the provider no longer has in the window. */
  deletes: string[];
  /** Linked metrics whose filter is invalid (reported, not synced). */
  invalidFilters: string[];
};

/**
 * `stored` must contain this provider's events for the linked metrics with
 * `occurredAt >= windowStart` — the same window the records cover.
 * Events of metrics that are no longer linked are never touched.
 */
export function planReconciliation({
  records,
  metrics,
  stored,
  windowStart,
}: {
  records: readonly NormalizedRecord[];
  metrics: readonly LinkedMetric[];
  stored: readonly StoredEvent[];
  windowStart: Date;
}): ReconcilePlan {
  const desired = new Map<string, EventWrite>();
  const invalidFilters: string[] = [];
  for (const metric of metrics) {
    const filter = parseSourceFilter(metric.sourceFilter);
    if (!filter) {
      invalidFilters.push(metric.id);
      continue;
    }
    for (const record of records) {
      if (record.sourceMetric !== metric.sourceMetric) continue;
      if (record.occurredAt < windowStart) continue;
      if (!matchesFilter(record, filter)) continue;
      desired.set(`${metric.id}|${record.externalRecordId}`, {
        metricDefinitionId: metric.id,
        externalRecordId: record.externalRecordId,
        value: record.value,
        occurredAt: record.occurredAt,
      });
    }
  }

  const linked = new Set(
    metrics.filter((m) => !invalidFilters.includes(m.id)).map((m) => m.id),
  );
  const inserts: EventWrite[] = [];
  const updates: (EventWrite & { id: string })[] = [];
  const deletes: string[] = [];
  const seen = new Set<string>();

  for (const event of stored) {
    if (!linked.has(event.metricDefinitionId)) continue;
    if (event.occurredAt < windowStart) continue;
    const key = `${event.metricDefinitionId}|${event.externalRecordId}`;
    const want = desired.get(key);
    if (!want) {
      deletes.push(event.id);
      continue;
    }
    seen.add(key);
    if (
      event.value !== want.value ||
      event.occurredAt.getTime() !== want.occurredAt.getTime()
    )
      updates.push({ ...want, id: event.id });
  }
  for (const [key, write] of desired) if (!seen.has(key)) inserts.push(write);

  return { inserts, updates, deletes, invalidFilters };
}
