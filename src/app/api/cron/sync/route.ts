import { NextResponse, type NextRequest } from "next/server";

import { isIntegrationProvider } from "@/features/integrations/server/registry";
import { syncProviderForUser } from "@/features/integrations/server/service";
import { getServerEnv } from "@/lib/env/server";
import { isAuthorizedCronRequest } from "@/lib/integrations/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** Stop starting new syncs after this, to finish within the function limit. */
const TIME_BUDGET_MS = 50_000;

/**
 * Scheduled sync of every connected integration (spec §31), called by
 * Vercel Cron with the CRON_SECRET bearer token. Returns counts only.
 */
export async function GET(request: NextRequest) {
  if (
    !isAuthorizedCronRequest(
      request.headers.get("authorization"),
      getServerEnv().CRON_SECRET,
    )
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("integrations")
    .select("user_id, provider")
    .eq("status", "connected")
    .order("last_synced_at", { ascending: true, nullsFirst: true });
  if (error)
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  for (const row of data) {
    if (
      Date.now() - started > TIME_BUDGET_MS ||
      !isIntegrationProvider(row.provider)
    ) {
      skipped += 1;
      continue;
    }
    try {
      const result = await syncProviderForUser(
        row.user_id,
        row.provider,
        admin,
      );
      if (result.ok) succeeded += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }
  return NextResponse.json({ succeeded, failed, skipped });
}
