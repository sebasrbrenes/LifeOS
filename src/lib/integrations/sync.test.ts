import { describe, expect, it, vi } from "vitest";

import type { LinkedMetric, StoredEvent } from "./reconcile";
import {
  FIRST_SYNC_DAYS,
  SYNC_WINDOW_DAYS,
  runSync,
  type SyncAdapter,
  type SyncStore,
} from "./sync";
import {
  ProviderError,
  type NormalizedRecord,
  type OAuthTokens,
} from "./types";

const NOW = new Date("2026-10-07T12:00:00Z");
const TOKENS: OAuthTokens = {
  accessToken: "access",
  refreshToken: "refresh",
  expiresAt: new Date("2026-10-07T18:00:00Z"),
  scopes: ["activity:read_all"],
  providerUserId: "42",
};
const KM: LinkedMetric = {
  id: "m-km",
  sourceMetric: "strava.run_distance_km",
  sourceFilter: {},
};
const record = (id: string, value: number): NormalizedRecord => ({
  sourceMetric: "strava.run_distance_km",
  occurredAt: new Date("2026-10-05T07:00:00Z"),
  value,
  externalRecordId: id,
  attributes: { sportType: "Run" },
});

/** In-memory store mirroring what the Supabase store persists. */
function memoryStore(
  initial: { tokens?: OAuthTokens | null; events?: StoredEvent[] } = {},
) {
  let tokens = initial.tokens === undefined ? TOKENS : initial.tokens;
  let events = [...(initial.events ?? [])];
  let nextId = 1;
  const runs: Record<string, unknown>[] = [];
  const states: Record<string, unknown>[] = [];
  const store: SyncStore = {
    loadTokens: async () => tokens,
    saveTokens: async (t) => {
      tokens = t;
    },
    loadLinkedMetrics: async () => [KM],
    loadStoredEvents: async (ids, from) =>
      events.filter(
        (e) => ids.includes(e.metricDefinitionId) && e.occurredAt >= from,
      ),
    apply: async ({ inserts, updates, deletes }) => {
      events = events.filter((e) => !deletes.includes(e.id));
      for (const u of updates)
        events = events.map((e) => (e.id === u.id ? { ...e, ...u } : e));
      for (const i of inserts) events.push({ ...i, id: `e${nextId++}` });
    },
    startRun: async () => "run-1",
    finishRun: async (_id, result) => {
      runs.push(result);
    },
    setIntegrationState: async (state) => {
      states.push(state);
    },
  };
  return { store, runs, states, events: () => events, tokens: () => tokens };
}

function adapter(overrides: Partial<SyncAdapter> = {}): SyncAdapter {
  return {
    provider: "strava",
    refresh: vi.fn(async (t: OAuthTokens) => ({ ...t, accessToken: "fresh" })),
    canRead: (scopes) => scopes.includes("activity:read_all"),
    fetchRecords: vi.fn(async () => [record("a", 10), record("b", 5)]),
    ...overrides,
  };
}

describe("runSync", () => {
  it("imports, then a second run changes nothing", async () => {
    const memory = memoryStore();
    const first = await runSync({
      adapter: adapter(),
      store: memory.store,
      providerName: "Strava",
      now: NOW,
      lastSuccessAt: null,
    });
    expect(first).toEqual({
      ok: true,
      received: 2,
      created: 2,
      updated: 0,
      deleted: 0,
      skippedMetrics: 0,
    });
    const second = await runSync({
      adapter: adapter(),
      store: memory.store,
      providerName: "Strava",
      now: NOW,
      lastSuccessAt: NOW,
    });
    expect(second).toMatchObject({
      ok: true,
      created: 0,
      updated: 0,
      deleted: 0,
    });
    expect(memory.events()).toHaveLength(2);
    expect(memory.runs.at(-1)).toMatchObject({ status: "succeeded" });
    expect(memory.states.at(-1)).toMatchObject({
      status: "connected",
      lastSuccessAt: NOW,
      lastError: null,
    });
  });

  it("reads 90 days the first time and 30 afterwards", async () => {
    const first = adapter();
    await runSync({
      adapter: first,
      store: memoryStore().store,
      providerName: "Strava",
      now: NOW,
      lastSuccessAt: null,
    });
    const window = vi.mocked(first.fetchRecords).mock.calls[0][1];
    expect((NOW.getTime() - window.from.getTime()) / 86_400_000).toBe(
      FIRST_SYNC_DAYS,
    );
    const later = adapter();
    await runSync({
      adapter: later,
      store: memoryStore().store,
      providerName: "Strava",
      now: NOW,
      lastSuccessAt: NOW,
    });
    const laterWindow = vi.mocked(later.fetchRecords).mock.calls[0][1];
    expect((NOW.getTime() - laterWindow.from.getTime()) / 86_400_000).toBe(
      SYNC_WINDOW_DAYS,
    );
  });

  it("refreshes expiring tokens and stores the rotated ones", async () => {
    const memory = memoryStore({
      tokens: { ...TOKENS, expiresAt: new Date("2026-10-07T12:01:00Z") },
    });
    const a = adapter();
    await runSync({
      adapter: a,
      store: memory.store,
      providerName: "Strava",
      now: NOW,
      lastSuccessAt: NOW,
    });
    expect(a.refresh).toHaveBeenCalledOnce();
    expect(memory.tokens()?.accessToken).toBe("fresh");
    expect(vi.mocked(a.fetchRecords).mock.calls[0][0]).toBe("fresh");
  });

  it("marks revoked access as an error the user can act on", async () => {
    const memory = memoryStore();
    const result = await runSync({
      adapter: adapter({
        fetchRecords: async () => {
          throw new ProviderError("strava", "unauthorized");
        },
      }),
      store: memory.store,
      providerName: "Strava",
      now: NOW,
      lastSuccessAt: new Date("2026-10-01T00:00:00Z"),
    });
    expect(result).toEqual({
      ok: false,
      code: "unauthorized",
      message:
        "Strava rechazó el acceso (permiso revocado o caducado). Vuelve a conectar.",
    });
    expect(memory.runs.at(-1)).toMatchObject({
      status: "failed",
      errorCode: "unauthorized",
    });
    expect(memory.states.at(-1)).toMatchObject({
      status: "error",
      lastSuccessAt: new Date("2026-10-01T00:00:00Z"),
    });
  });

  it("refuses to sync without the read scope", async () => {
    const result = await runSync({
      adapter: adapter(),
      store: memoryStore({ tokens: { ...TOKENS, scopes: ["read"] } }).store,
      providerName: "Strava",
      now: NOW,
      lastSuccessAt: null,
    });
    expect(result).toMatchObject({ ok: false, code: "missing_scope" });
  });

  it("never leaks unexpected error details", async () => {
    const result = await runSync({
      adapter: adapter({
        fetchRecords: async () => {
          throw new Error("token=abc123 internal");
        },
      }),
      store: memoryStore().store,
      providerName: "Strava",
      now: NOW,
      lastSuccessAt: null,
    });
    expect(result).toMatchObject({ ok: false, code: "failed" });
    expect(JSON.stringify(result)).not.toContain("abc123");
  });
});
