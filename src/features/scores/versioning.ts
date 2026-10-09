import "server-only";

import { buildScoreConfiguration } from "@/lib/scoring";
import type { Json } from "@/lib/supabase/database.types";
import type { createClient } from "@/lib/supabase/server";

import { toCategoryInput, toMetricInput } from "./mappers";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * Records the scoring configuration now in force (spec §21.9). Call after
 * any change that can alter scores: category weights/enabled, metric
 * creation, deletion, enabling, or scoring settings. The RPC is a no-op
 * when nothing that affects scores changed, and atomically closes the old
 * version otherwise.
 */
export async function syncScoreVersion(supabase: Client): Promise<void> {
  const [categories, metrics] = await Promise.all([
    supabase
      .from("score_categories")
      .select("id, key, name, weight, enabled, position"),
    supabase
      .from("metric_definitions")
      .select(
        "id, key, name, description, category_id, direction, period, aggregation, weight, enabled, source_preference, config, unit, position",
      ),
  ]);
  if (categories.error) throw new Error(categories.error.message);
  if (metrics.error) throw new Error(metrics.error.message);

  const configuration = buildScoreConfiguration(
    categories.data.map(toCategoryInput),
    metrics.data.map(toMetricInput),
  );
  const { error } = await supabase.rpc("record_score_version", {
    p_configuration: configuration as unknown as Json,
  });
  if (error)
    throw new Error(`Failed to record score version: ${error.message}`);
}
