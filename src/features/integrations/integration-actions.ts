"use server";

import { refresh } from "next/cache";

import type { ActionState } from "@/lib/action-state";
import { requireUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { isIntegrationProvider, providerClient } from "./server/registry";
import { loadIntegration, syncProviderForUser } from "./server/service";
import { disconnect, readTokens } from "./server/store";

/** Minimum time between manual syncs, to respect provider rate limits. */
const MANUAL_SYNC_COOLDOWN_MS = 2 * 60_000;

export async function syncNow(provider: string): Promise<ActionState> {
  const user = await requireUser();
  if (!isIntegrationProvider(provider) || !providerClient(provider))
    return { status: "error", message: "Integración no disponible." };
  const admin = createAdminClient();
  const integration = await loadIntegration(admin, user.id, provider);
  if (
    integration?.last_synced_at &&
    Date.now() - new Date(integration.last_synced_at).getTime() <
      MANUAL_SYNC_COOLDOWN_MS
  )
    return {
      status: "error",
      message: "Acabas de sincronizar. Espera un par de minutos.",
    };
  const result = await syncProviderForUser(user.id, provider, admin);
  refresh();
  return result.ok
    ? {
        status: "success",
        message: `Sincronizado: ${result.created} nuevo(s), ${result.updated} actualizado(s), ${result.deleted} eliminado(s).`,
      }
    : { status: "error", message: result.message };
}

/**
 * Revokes access at the provider (best effort) and forgets the tokens.
 * Imported values stay until the user deletes them separately.
 */
export async function disconnectProvider(
  provider: string,
): Promise<ActionState> {
  const user = await requireUser();
  if (!isIntegrationProvider(provider) || !providerClient(provider))
    return { status: "error", message: "Integración no disponible." };
  const admin = createAdminClient();
  const integration = await loadIntegration(admin, user.id, provider);
  if (!integration) return { status: "error", message: "No estaba conectada." };
  try {
    const tokens = await readTokens(admin, integration);
    if (tokens) await providerClient(provider)?.revoke(tokens);
  } catch {
    // The provider may already have revoked it; forgetting tokens matters.
  }
  await disconnect(admin, integration);
  refresh();
  return {
    status: "success",
    message:
      "Desconectada. Tus valores importados se conservan; puedes borrarlos aparte.",
  };
}

/** Deletes every value imported from a provider (spec §36 privacy). */
export async function deleteImportedData(
  provider: string,
): Promise<ActionState> {
  await requireUser();
  if (!isIntegrationProvider(provider))
    return { status: "error", message: "Integración no válida." };
  // As the user: RLS lets owners delete any of their own events.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("metric_events")
    .delete()
    .eq("source", provider)
    .select("id");
  if (error)
    return { status: "error", message: "No se pudieron borrar los datos." };
  refresh();
  return {
    status: "success",
    message: `${data.length} valor(es) importados eliminados.`,
  };
}
