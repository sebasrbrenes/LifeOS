import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getPublicEnv } from "@/lib/env/public";
import { getServerEnv } from "@/lib/env/server";

import type { Database } from "./database.types";

/**
 * Service-role client: bypasses RLS. Server-only, and used only where the
 * design requires it — writing provider data and encrypted tokens, which
 * users can never write themselves (ADR-033). Every query through it must
 * filter by the user id the caller verified.
 */
export function createAdminClient() {
  const key = getServerEnv().SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return createClient<Database>(getPublicEnv().NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type AdminClient = ReturnType<typeof createAdminClient>;
