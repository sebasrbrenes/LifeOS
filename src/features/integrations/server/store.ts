import "server-only";

import { getServerEnv } from "@/lib/env/server";
import type { StoredEvent } from "@/lib/integrations/reconcile";
import type { SyncStore } from "@/lib/integrations/sync";
import type {
  IntegrationProvider,
  OAuthTokens,
} from "@/lib/integrations/types";
import { decryptToken, encryptToken } from "@/lib/security/token-crypto";
import type { AdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/paginate";

/**
 * Persistence for integrations through the service-role client. Every
 * query is explicitly scoped to the verified `userId` (RLS doesn't apply
 * to this client). Tokens are encrypted with the integration id as
 * associated data and never logged.
 */

const CHUNK = 200;

function encryptionKey(): string {
  const key = getServerEnv().TOKEN_ENCRYPTION_KEY;
  if (!key) throw new Error("TOKEN_ENCRYPTION_KEY is not configured");
  return key;
}

function check(error: { message: string } | null, context: string) {
  // Messages may echo data; keep only the context in the thrown error.
  if (error) throw new Error(`integration store: ${context} failed`);
}

export type IntegrationRow = {
  id: string;
  user_id: string;
  provider: string;
  status: string;
  last_success_at: string | null;
  last_synced_at: string | null;
};

/** Creates or reconnects the user's integration and stores its tokens. */
export async function saveConnection(
  admin: AdminClient,
  userId: string,
  provider: IntegrationProvider,
  tokens: OAuthTokens,
): Promise<IntegrationRow> {
  const { data, error } = await admin
    .from("integrations")
    .upsert(
      {
        user_id: userId,
        provider,
        status: "connected",
        scopes: tokens.scopes,
        provider_user_id: tokens.providerUserId,
        last_error: null,
      },
      { onConflict: "user_id,provider" },
    )
    .select("id, user_id, provider, status, last_success_at, last_synced_at")
    .single();
  check(error, "save integration");
  await writeTokens(admin, data!.id, tokens);
  return data!;
}

async function writeTokens(
  admin: AdminClient,
  integrationId: string,
  tokens: OAuthTokens,
) {
  const key = encryptionKey();
  const { error } = await admin.from("oauth_credentials").upsert(
    {
      integration_id: integrationId,
      encrypted_access_token: encryptToken(
        tokens.accessToken,
        key,
        integrationId,
      ),
      encrypted_refresh_token: tokens.refreshToken
        ? encryptToken(tokens.refreshToken, key, integrationId)
        : null,
      expires_at: tokens.expiresAt?.toISOString() ?? null,
      token_type: "Bearer",
    },
    { onConflict: "integration_id" },
  );
  check(error, "save tokens");
}

export async function readTokens(
  admin: AdminClient,
  integration: { id: string; user_id: string },
): Promise<OAuthTokens | null> {
  const [credentials, row] = await Promise.all([
    admin
      .from("oauth_credentials")
      .select("encrypted_access_token, encrypted_refresh_token, expires_at")
      .eq("integration_id", integration.id)
      .maybeSingle(),
    admin
      .from("integrations")
      .select("scopes, provider_user_id")
      .eq("id", integration.id)
      .eq("user_id", integration.user_id)
      .single(),
  ]);
  check(credentials.error, "read tokens");
  check(row.error, "read integration");
  if (!credentials.data) return null;
  const key = encryptionKey();
  return {
    accessToken: decryptToken(
      credentials.data.encrypted_access_token,
      key,
      integration.id,
    ),
    refreshToken: credentials.data.encrypted_refresh_token
      ? decryptToken(
          credentials.data.encrypted_refresh_token,
          key,
          integration.id,
        )
      : null,
    expiresAt: credentials.data.expires_at
      ? new Date(credentials.data.expires_at)
      : null,
    scopes: Array.isArray(row.data!.scopes)
      ? row.data!.scopes.filter((s): s is string => typeof s === "string")
      : [],
    providerUserId: row.data!.provider_user_id,
  };
}

/** Forgets the tokens and marks the integration disconnected. */
export async function disconnect(
  admin: AdminClient,
  integration: { id: string; user_id: string },
): Promise<void> {
  const removed = await admin
    .from("oauth_credentials")
    .delete()
    .eq("integration_id", integration.id);
  check(removed.error, "delete tokens");
  const updated = await admin
    .from("integrations")
    .update({ status: "disconnected", last_error: null })
    .eq("id", integration.id)
    .eq("user_id", integration.user_id);
  check(updated.error, "mark disconnected");
}

export function supabaseSyncStore(
  admin: AdminClient,
  integration: IntegrationRow & { provider: IntegrationProvider },
): SyncStore {
  const userId = integration.user_id;
  const source = integration.provider;
  return {
    loadTokens: () => readTokens(admin, integration),
    saveTokens: (tokens) => writeTokens(admin, integration.id, tokens),
    async loadLinkedMetrics() {
      const { data, error } = await admin
        .from("metric_definitions")
        .select("id, source_metric, source_filter")
        .eq("user_id", userId)
        .eq("source_preference", source)
        .eq("enabled", true)
        .not("source_metric", "is", null);
      check(error, "load linked metrics");
      return data!.map((row) => ({
        id: row.id,
        sourceMetric: row.source_metric!,
        sourceFilter: row.source_filter,
      }));
    },
    async loadStoredEvents(metricIds, from) {
      const rows = await fetchAllRows<{
        id: string;
        metric_definition_id: string;
        external_record_id: string | null;
        value_numeric: number | null;
        occurred_at: string;
      }>((start, end) =>
        admin
          .from("metric_events")
          .select(
            "id, metric_definition_id, external_record_id, value_numeric, occurred_at",
          )
          .eq("user_id", userId)
          .eq("source", source)
          .in("metric_definition_id", metricIds)
          .gte("occurred_at", from.toISOString())
          .order("id")
          .range(start, end),
      );
      return rows.flatMap((row): StoredEvent[] =>
        row.external_record_id
          ? [
              {
                id: row.id,
                metricDefinitionId: row.metric_definition_id,
                externalRecordId: row.external_record_id,
                value:
                  row.value_numeric === null ? null : Number(row.value_numeric),
                occurredAt: new Date(row.occurred_at),
              },
            ]
          : [],
      );
    },
    async apply({ inserts, updates, deletes }) {
      for (let i = 0; i < deletes.length; i += CHUNK) {
        const { error } = await admin
          .from("metric_events")
          .delete()
          .eq("user_id", userId)
          .eq("source", source)
          .in("id", deletes.slice(i, i + CHUNK));
        check(error, "delete events");
      }
      for (const update of updates) {
        const { error } = await admin
          .from("metric_events")
          .update({
            value_numeric: update.value,
            occurred_at: update.occurredAt.toISOString(),
          })
          .eq("id", update.id)
          .eq("user_id", userId)
          .eq("source", source);
        check(error, "update event");
      }
      for (let i = 0; i < inserts.length; i += CHUNK) {
        const { error } = await admin.from("metric_events").insert(
          inserts.slice(i, i + CHUNK).map((write) => ({
            user_id: userId,
            metric_definition_id: write.metricDefinitionId,
            occurred_at: write.occurredAt.toISOString(),
            value_numeric: write.value,
            source,
            external_record_id: write.externalRecordId,
          })),
        );
        check(error, "insert events");
      }
    },
    async startRun() {
      const { data, error } = await admin
        .from("sync_runs")
        .insert({ user_id: userId, integration_id: integration.id })
        .select("id")
        .single();
      check(error, "start run");
      return data!.id;
    },
    async finishRun(runId, result) {
      const { error } = await admin
        .from("sync_runs")
        .update({
          status: result.status,
          finished_at: new Date().toISOString(),
          records_received: result.received,
          records_created: result.created,
          records_updated: result.updated,
          error_code: result.errorCode,
        })
        .eq("id", runId)
        .eq("user_id", userId);
      check(error, "finish run");
    },
    async setIntegrationState(state) {
      const { error } = await admin
        .from("integrations")
        .update({
          status: state.status,
          last_synced_at: state.lastSyncedAt.toISOString(),
          last_success_at: state.lastSuccessAt?.toISOString() ?? null,
          last_error: state.lastError,
        })
        .eq("id", integration.id)
        .eq("user_id", userId);
      check(error, "update integration");
    },
  };
}
