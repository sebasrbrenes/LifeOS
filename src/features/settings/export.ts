import "server-only";

import { fetchAllRows } from "@/lib/supabase/paginate";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * Tables included in a personal data export (spec §22), each with a
 * deterministic order for pagination. `oauth_credentials` is deliberately
 * absent: tokens are unreadable even for their owner and never leave the
 * server.
 */
export const EXPORT_TABLES = {
  profiles: "user_id",
  score_categories: "id",
  metric_definitions: "id",
  metric_events: "id",
  goals: "id",
  goal_milestones: "id",
  weekly_commitments: "id",
  weekly_reviews: "id",
  score_versions: "id",
  score_snapshots: "id",
  integrations: "id",
  sync_runs: "id",
  ai_insights: "id",
} as const;

export type ExportTable = keyof typeof EXPORT_TABLES;

export const EXPORT_FORMAT = "life-os-export";
export const EXPORT_FORMAT_VERSION = 1;

/** Every row the signed-in user owns, read through RLS. */
export async function buildPersonalExport(
  supabase: Client,
  user: { id: string; email: string | null },
  now: Date,
) {
  const tables = Object.fromEntries(
    await Promise.all(
      (Object.entries(EXPORT_TABLES) as [ExportTable, string][]).map(
        async ([table, orderBy]) => [
          table,
          await fetchAllRows<Record<string, unknown>>((from, to) =>
            supabase.from(table).select("*").order(orderBy).range(from, to),
          ),
        ],
      ),
    ),
  ) as Record<ExportTable, Record<string, unknown>[]>;

  return {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: now.toISOString(),
    user: { id: user.id, email: user.email },
    tables,
  };
}

/** "life-os-export-2026-10-07.json" */
export function exportFileName(localDate: string): string {
  return `life-os-export-${localDate}.json`;
}
