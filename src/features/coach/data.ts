import "server-only";

import { cache } from "react";

import { coachInsightSchema } from "@/lib/ai/coach";
import { getServerEnv } from "@/lib/env/server";
import { createClient } from "@/lib/supabase/server";

import { MAX_INSIGHTS_PER_WEEK } from "./limits";
import type { StoredInsight } from "./components/coach-panel";

export const loadCoach = cache(async (weekStart: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_insights")
    .select("id, model, created_at, content, payload")
    .eq("week_start", weekStart)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to load insights: ${error.message}`);
  const latest = data
    .map((row): StoredInsight | null => {
      const content = coachInsightSchema.safeParse(row.content);
      return content.success
        ? {
            id: row.id,
            model: row.model,
            createdAt: row.created_at,
            content: content.data,
            payload: row.payload,
          }
        : null;
    })
    .find((row) => row !== null);
  return {
    configured: Boolean(getServerEnv().ANTHROPIC_API_KEY),
    insight: latest ?? null,
    remaining: Math.max(0, MAX_INSIGHTS_PER_WEEK - data.length),
  };
});
