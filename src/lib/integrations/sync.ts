import {
  planReconciliation,
  type EventWrite,
  type LinkedMetric,
  type ReconcilePlan,
  type StoredEvent,
} from "./reconcile";
import {
  ProviderError,
  type IntegrationProvider,
  type NormalizedRecord,
  type OAuthTokens,
} from "./types";

/**
 * Provider-agnostic sync (spec §15, §32): refresh tokens when needed,
 * fetch a window of records, reconcile them into metric events, and
 * record the outcome — never failing silently. Storage and provider
 * calls are injected, so the orchestration is tested in memory.
 */

/** Days re-read on each sync, to catch edits and deletions. */
export const SYNC_WINDOW_DAYS = 30;
/** Days imported on the first sync. */
export const FIRST_SYNC_DAYS = 90;
/** Refresh tokens this long before they expire. */
const REFRESH_MARGIN_MS = 5 * 60_000;

export type SyncAdapter = {
  provider: IntegrationProvider;
  refresh(tokens: OAuthTokens): Promise<OAuthTokens>;
  canRead(scopes: readonly string[]): boolean;
  fetchRecords(
    accessToken: string,
    window: { from: Date; to: Date },
    metrics: readonly LinkedMetric[],
  ): Promise<NormalizedRecord[]>;
};

export type SyncStore = {
  loadTokens(): Promise<OAuthTokens | null>;
  saveTokens(tokens: OAuthTokens): Promise<void>;
  loadLinkedMetrics(): Promise<LinkedMetric[]>;
  loadStoredEvents(metricIds: string[], from: Date): Promise<StoredEvent[]>;
  apply(plan: {
    inserts: EventWrite[];
    updates: ReconcilePlan["updates"];
    deletes: string[];
  }): Promise<void>;
  startRun(): Promise<string>;
  finishRun(
    runId: string,
    result: {
      status: "succeeded" | "failed" | "partial";
      received: number;
      created: number;
      updated: number;
      errorCode: string | null;
    },
  ): Promise<void>;
  setIntegrationState(state: {
    status: "connected" | "error";
    lastSyncedAt: Date;
    lastSuccessAt: Date | null;
    lastError: string | null;
  }): Promise<void>;
};

export type SyncResult =
  | {
      ok: true;
      received: number;
      created: number;
      updated: number;
      deleted: number;
      skippedMetrics: number;
    }
  | { ok: false; code: SyncFailureCode; message: string };

export type SyncFailureCode =
  | "not_connected"
  | "missing_scope"
  | "unauthorized"
  | "rate_limited"
  | "unavailable"
  | "failed";

/** User-facing (Spanish) message per failure; never provider details. */
export function syncFailureMessage(
  code: SyncFailureCode,
  providerName: string,
): string {
  switch (code) {
    case "not_connected":
      return `${providerName} no está conectado.`;
    case "missing_scope":
      return `No diste permiso para leer tus datos en ${providerName}. Vuelve a conectar y acepta el acceso.`;
    case "unauthorized":
      return `${providerName} rechazó el acceso (permiso revocado o caducado). Vuelve a conectar.`;
    case "rate_limited":
      return `${providerName} pide esperar antes de volver a sincronizar. Se reintentará más tarde.`;
    case "unavailable":
      return `${providerName} no responde ahora mismo. Se reintentará más tarde.`;
    case "failed":
      return `La sincronización con ${providerName} falló. Se reintentará más tarde.`;
  }
}

export async function runSync({
  adapter,
  store,
  providerName,
  now,
  lastSuccessAt,
}: {
  adapter: SyncAdapter;
  store: SyncStore;
  providerName: string;
  now: Date;
  lastSuccessAt: Date | null;
}): Promise<SyncResult> {
  const runId = await store.startRun();
  const fail = async (code: SyncFailureCode): Promise<SyncResult> => {
    const message = syncFailureMessage(code, providerName);
    await store.finishRun(runId, {
      status: "failed",
      received: 0,
      created: 0,
      updated: 0,
      errorCode: code,
    });
    await store.setIntegrationState({
      status: "error",
      lastSyncedAt: now,
      lastSuccessAt,
      lastError: message,
    });
    return { ok: false, code, message };
  };

  try {
    let tokens = await store.loadTokens();
    if (!tokens) return await fail("not_connected");
    if (!adapter.canRead(tokens.scopes)) return await fail("missing_scope");
    if (
      tokens.expiresAt &&
      tokens.expiresAt.getTime() - now.getTime() < REFRESH_MARGIN_MS
    ) {
      tokens = await adapter.refresh(tokens);
      await store.saveTokens(tokens);
    }

    const metrics = await store.loadLinkedMetrics();
    const days = lastSuccessAt ? SYNC_WINDOW_DAYS : FIRST_SYNC_DAYS;
    const from = new Date(now.getTime() - days * 86_400_000);
    const records =
      metrics.length > 0
        ? await adapter.fetchRecords(
            tokens.accessToken,
            { from, to: now },
            metrics,
          )
        : [];
    const stored =
      metrics.length > 0
        ? await store.loadStoredEvents(
            metrics.map((m) => m.id),
            from,
          )
        : [];
    const plan = planReconciliation({
      records,
      metrics,
      stored,
      windowStart: from,
    });
    await store.apply(plan);

    const status = plan.invalidFilters.length > 0 ? "partial" : "succeeded";
    await store.finishRun(runId, {
      status,
      received: records.length,
      created: plan.inserts.length,
      updated: plan.updates.length,
      errorCode: plan.invalidFilters.length > 0 ? "invalid_filter" : null,
    });
    await store.setIntegrationState({
      status: "connected",
      lastSyncedAt: now,
      lastSuccessAt: now,
      lastError:
        plan.invalidFilters.length > 0
          ? `${plan.invalidFilters.length} métrica(s) tienen un filtro de origen no válido y no se sincronizaron.`
          : null,
    });
    return {
      ok: true,
      received: records.length,
      created: plan.inserts.length,
      updated: plan.updates.length,
      deleted: plan.deletes.length,
      skippedMetrics: plan.invalidFilters.length,
    };
  } catch (error) {
    if (error instanceof ProviderError) {
      return await fail(error.code === "bad_response" ? "failed" : error.code);
    }
    return await fail("failed");
  }
}
