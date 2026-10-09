import "server-only";

import { runSync, type SyncResult } from "@/lib/integrations/sync";
import type { IntegrationProvider } from "@/lib/integrations/types";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";

import { providerClient } from "./registry";
import { supabaseSyncStore, type IntegrationRow } from "./store";

export async function loadIntegration(
  admin: AdminClient,
  userId: string,
  provider: IntegrationProvider,
): Promise<(IntegrationRow & { provider: IntegrationProvider }) | null> {
  const { data, error } = await admin
    .from("integrations")
    .select("id, user_id, provider, status, last_success_at, last_synced_at")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  if (error) throw new Error("integration lookup failed");
  return data ? { ...data, provider } : null;
}

/** Syncs one user's provider now. The caller has verified `userId`. */
export async function syncProviderForUser(
  userId: string,
  provider: IntegrationProvider,
  admin: AdminClient = createAdminClient(),
): Promise<SyncResult> {
  const client = providerClient(provider);
  const integration = await loadIntegration(admin, userId, provider);
  if (!client || !integration || integration.status === "disconnected")
    return {
      ok: false,
      code: "not_connected",
      message: "La integración no está conectada.",
    };
  return runSync({
    adapter: client,
    store: supabaseSyncStore(admin, integration),
    providerName: client.name,
    now: new Date(),
    lastSuccessAt: integration.last_success_at
      ? new Date(integration.last_success_at)
      : null,
  });
}
