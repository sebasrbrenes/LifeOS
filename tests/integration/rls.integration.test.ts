import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/lib/supabase/database.types";

/**
 * Row Level Security through the real Data API, exactly as the app talks
 * to it: two signed-in users and an anonymous caller against the linked
 * development project. Run with `npm run test:integration`.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function client() {
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signIn(email: string, password: string) {
  const supabase = client();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.code}`);
  return supabase;
}

let a: SupabaseClient<Database>;
let b: SupabaseClient<Database>;
let aCategoryId: string;
let aMetricId: string;
let aEventId: string;
const marker = `rls_${Date.now()}`;

beforeAll(async () => {
  a = await signIn(process.env.E2E_USER_EMAIL!, process.env.E2E_USER_PASSWORD!);
  b = await signIn(
    process.env.E2E_OTHER_USER_EMAIL!,
    process.env.E2E_OTHER_USER_PASSWORD!,
  );

  const category = await a
    .from("score_categories")
    .select("id")
    .eq("key", "body")
    .single();
  if (category.error) throw category.error;
  aCategoryId = category.data.id;

  const metric = await a
    .from("metric_definitions")
    .insert({
      category_id: aCategoryId,
      key: marker,
      name: "RLS probe",
      direction: "higher_is_better",
      period: "weekly",
      aggregation: "sum",
      config: { target: 10 },
    })
    .select("id")
    .single();
  if (metric.error) throw metric.error;
  aMetricId = metric.data.id;

  const event = await a
    .from("metric_events")
    .insert({
      metric_definition_id: aMetricId,
      occurred_at: new Date().toISOString(),
      value_numeric: 5,
    })
    .select("id")
    .single();
  if (event.error) throw event.error;
  aEventId = event.data.id;
});

afterAll(async () => {
  if (!a) return;
  await a.from("metric_events").delete().eq("metric_definition_id", aMetricId);
  await a.from("metric_definitions").delete().eq("id", aMetricId);
});

describe("RLS through the Data API", () => {
  it("each user sees only their own categories", async () => {
    const own = await a.from("score_categories").select("id, user_id");
    const other = await b.from("score_categories").select("id, user_id");
    expect(own.data).toHaveLength(6);
    expect(other.data).toHaveLength(6);
    const aIds = new Set(own.data!.map((c) => c.id));
    expect(other.data!.some((c) => aIds.has(c.id))).toBe(false);
  });

  it("another user can't read A's metrics or values", async () => {
    const metric = await b
      .from("metric_definitions")
      .select("id")
      .eq("id", aMetricId);
    const event = await b.from("metric_events").select("id").eq("id", aEventId);
    expect(metric.data).toEqual([]);
    expect(event.data).toEqual([]);
  });

  it("another user can't change or delete A's values", async () => {
    const update = await b
      .from("metric_events")
      .update({ value_numeric: 999 })
      .eq("id", aEventId)
      .select("id");
    const remove = await b
      .from("metric_events")
      .delete()
      .eq("id", aEventId)
      .select("id");
    expect(update.data).toEqual([]);
    expect(remove.data).toEqual([]);

    const check = await a
      .from("metric_events")
      .select("value_numeric")
      .eq("id", aEventId)
      .single();
    expect(check.data?.value_numeric).toBe(5);
  });

  it("another user can't attach data to A's category or metric", async () => {
    const metric = await b.from("metric_definitions").insert({
      category_id: aCategoryId,
      key: `${marker}_spy`,
      name: "Spy",
      direction: "higher_is_better",
      period: "weekly",
      aggregation: "sum",
      config: { target: 1 },
    });
    expect(metric.error?.code).toBe("23503");

    const event = await b.from("metric_events").insert({
      metric_definition_id: aMetricId,
      occurred_at: new Date().toISOString(),
      value_numeric: 1,
    });
    expect(event.error?.code).toBe("23503");
  });

  it("another user can't insert rows owned by A", async () => {
    const { data: user } = await a.auth.getUser();
    const result = await b
      .from("score_categories")
      .insert({ user_id: user.user!.id, key: "spy", name: "Spy", weight: 1 });
    expect(result.error?.code).toBe("42501");
  });

  it("the weights RPC can't touch another user's categories", async () => {
    const result = await b.rpc("update_category_settings", {
      p_categories: [
        { id: aCategoryId, name: "Hacked", weight: 100, enabled: true },
      ],
    });
    expect(result.error?.code).toBe("P0002");
  });

  it("users can't forge provider-sourced values", async () => {
    const result = await a.from("metric_events").insert({
      metric_definition_id: aMetricId,
      occurred_at: new Date().toISOString(),
      value_numeric: 1,
      source: "strava",
      external_record_id: `${marker}-forged`,
    });
    expect(result.error?.code).toBe("42501");
  });

  it("provider tokens are unreadable even for their owner", async () => {
    const result = await a.from("oauth_credentials").select("*");
    expect(result.error?.code).toBe("42501");
  });

  it("closing a week only freezes the caller's own week", async () => {
    // An old week neither user has closed (reviews are permanent).
    const [aReviews, bReviews] = await Promise.all([
      a.from("weekly_reviews").select("week_start"),
      b.from("weekly_reviews").select("week_start"),
    ]);
    const taken = new Set(
      [...(aReviews.data ?? []), ...(bReviews.data ?? [])].map(
        (r) => r.week_start,
      ),
    );
    const start = new Date(Date.UTC(2020, 0, 6));
    while (taken.has(start.toISOString().slice(0, 10)))
      start.setUTCDate(start.getUTCDate() - 7);
    const week = start.toISOString().slice(0, 10);

    const mine = await a
      .from("weekly_commitments")
      .insert({ week_start: week, title: marker, target_value: 2 })
      .select("id")
      .single();
    expect(mine.error).toBeNull();
    try {
      // B can't see or touch A's commitment.
      const peek = await b
        .from("weekly_commitments")
        .select("id")
        .eq("id", mine.data!.id);
      expect(peek.data).toEqual([]);
      const tamper = await b
        .from("weekly_commitments")
        .update({ actual_value: 2 })
        .eq("id", mine.data!.id)
        .select("id");
      expect(tamper.data).toEqual([]);

      // B closing the same calendar week closes only B's week.
      const closed = await b.rpc("close_week", {
        p_week_start: week,
        p_life_score_start: null as unknown as number,
        p_life_score_end: null as unknown as number,
        p_week_score: null as unknown as number,
        p_score_version_id: null as unknown as string,
        p_summary: {},
        p_user_notes: "",
      });
      expect(closed.error).toBeNull();
      const after = await a
        .from("weekly_commitments")
        .update({ actual_value: 1 })
        .eq("id", mine.data!.id)
        .select("status, actual_value");
      expect(after.data).toEqual([{ status: "active", actual_value: 1 }]);
      const aSees = await a
        .from("weekly_reviews")
        .select("week_start")
        .eq("week_start", week);
      expect(aSees.data).toEqual([]);
    } finally {
      await a.from("weekly_commitments").delete().eq("id", mine.data!.id);
    }
  });

  it("signed-out callers get nothing", async () => {
    const anon = client();
    for (const table of [
      "profiles",
      "score_categories",
      "metric_definitions",
      "metric_events",
      "weekly_commitments",
      "weekly_reviews",
    ] as const) {
      const result = await anon.from(table).select("*").limit(1);
      expect(result.error?.code, table).toBe("42501");
    }
    const rpc = await anon.rpc("record_score_version", { p_configuration: {} });
    expect(rpc.error).not.toBeNull();
    const close = await anon.rpc("close_week", {
      p_week_start: "2020-01-06",
      p_life_score_start: 0,
      p_life_score_end: 0,
      p_week_score: 0,
      p_score_version_id: null as unknown as string,
      p_summary: {},
      p_user_notes: "",
    });
    expect(close.error).not.toBeNull();
  });
});
