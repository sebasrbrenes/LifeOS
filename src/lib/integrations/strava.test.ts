import { describe, expect, it, vi } from "vitest";

import {
  canReadActivities,
  exchangeStravaCode,
  fetchStravaRecords,
  normalizeStravaActivity,
  parseGrantedScopes,
  refreshStravaToken,
  stravaAuthorizeUrl,
} from "./strava";
import { ProviderError, type Fetch } from "./types";

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

const run = {
  id: 9001,
  sport_type: "Run",
  distance: 10_234.5,
  moving_time: 3_000,
  total_elevation_gain: 85.25,
  start_date: "2026-10-04T07:30:00Z",
};

describe("stravaAuthorizeUrl", () => {
  it("asks only to read activities and carries the state", () => {
    const url = new URL(
      stravaAuthorizeUrl({
        clientId: "123",
        redirectUri: "http://localhost:3000/integrations/strava/callback",
        state: "abc",
      }),
    );
    expect(url.origin + url.pathname).toBe(
      "https://www.strava.com/oauth/authorize",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "123",
      redirect_uri: "http://localhost:3000/integrations/strava/callback",
      response_type: "code",
      approval_prompt: "auto",
      scope: "activity:read_all",
      state: "abc",
    });
  });
});

describe("scopes", () => {
  it("parses what the user actually granted", () => {
    expect(parseGrantedScopes("read,activity:read")).toEqual([
      "activity:read",
      "read",
    ]);
    expect(parseGrantedScopes(null)).toEqual([]);
    expect(canReadActivities(["read"])).toBe(false);
    expect(canReadActivities(["activity:read_all", "read"])).toBe(true);
  });
});

describe("token exchange", () => {
  it("posts the code server-side and returns typed tokens", async () => {
    const fetchImpl = vi.fn<Fetch>().mockResolvedValue(
      json({
        token_type: "Bearer",
        access_token: "access-1",
        refresh_token: "refresh-1",
        expires_at: 1_790_000_000,
        athlete: { id: 42 },
      }),
    );
    const tokens = await exchangeStravaCode(fetchImpl, {
      clientId: "123",
      clientSecret: "secret",
      code: "the-code",
      scope: "read,activity:read_all",
    });
    expect(tokens).toEqual({
      accessToken: "access-1",
      refreshToken: "refresh-1",
      expiresAt: new Date(1_790_000_000_000),
      scopes: ["activity:read_all", "read"],
      providerUserId: "42",
    });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://www.strava.com/oauth/token");
    expect(init?.method).toBe("POST");
    expect(new URLSearchParams(String(init?.body)).get("grant_type")).toBe(
      "authorization_code",
    );
  });

  it("keeps the athlete id and scopes across refreshes", async () => {
    const fetchImpl = vi.fn<Fetch>().mockResolvedValue(
      json({
        access_token: "access-2",
        refresh_token: "refresh-2",
        expires_at: 1_790_000_100,
      }),
    );
    const tokens = await refreshStravaToken(fetchImpl, {
      clientId: "123",
      clientSecret: "secret",
      refreshToken: "refresh-1",
      scopes: ["activity:read_all"],
      providerUserId: "42",
    });
    expect(tokens).toMatchObject({
      refreshToken: "refresh-2",
      providerUserId: "42",
      scopes: ["activity:read_all"],
    });
  });

  it("maps failures to typed errors without the response body", async () => {
    const leaky = json({ message: "secret detail" }, { status: 401 });
    const error = await exchangeStravaCode(
      vi.fn<Fetch>().mockResolvedValue(leaky),
      {
        clientId: "1",
        clientSecret: "s",
        code: "c",
        scope: "",
      },
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).code).toBe("unauthorized");
    expect(String(error)).not.toContain("secret detail");
  });
});

describe("normalizeStravaActivity", () => {
  it("turns a run into canonical records", () => {
    const records = normalizeStravaActivity(run);
    const byMetric = Object.fromEntries(
      records.map((r) => [r.sourceMetric, r.value]),
    );
    expect(byMetric).toEqual({
      "strava.activity_count": 1,
      "strava.moving_minutes": 50,
      "strava.elevation_gain_m": 85.3,
      "strava.run_distance_km": 10.235,
      "strava.run_count": 1,
    });
    expect(records.every((r) => r.externalRecordId === "9001")).toBe(true);
    expect(records[0].occurredAt.toISOString()).toBe(
      "2026-10-04T07:30:00.000Z",
    );
    expect(records[0].attributes).toEqual({ sportType: "Run" });
  });

  it("counts rides as rides and other sports only in totals", () => {
    const ride = normalizeStravaActivity({ ...run, sport_type: "GravelRide" });
    expect(ride.map((r) => r.sourceMetric)).toContain(
      "strava.ride_distance_km",
    );
    expect(ride.map((r) => r.sourceMetric)).not.toContain("strava.run_count");
    const swim = normalizeStravaActivity({
      ...run,
      sport_type: "Swim",
      total_elevation_gain: undefined,
    });
    expect(swim.map((r) => r.sourceMetric).sort()).toEqual([
      "strava.activity_count",
      "strava.moving_minutes",
    ]);
  });
});

describe("fetchStravaRecords", () => {
  it("pages until a short page and skips malformed activities", async () => {
    const fullPage = Array.from({ length: 200 }, (_, i) => ({
      ...run,
      id: i + 1,
    }));
    const fetchImpl = vi
      .fn<Fetch>()
      .mockResolvedValueOnce(json(fullPage))
      .mockResolvedValueOnce(json([{ ...run, id: 999 }, { nonsense: true }]));
    const { activityIds, records } = await fetchStravaRecords(
      fetchImpl,
      "token",
      new Date("2026-09-01T00:00:00Z"),
    );
    expect(activityIds).toHaveLength(201);
    expect(
      records.filter((r) => r.sourceMetric === "strava.run_count"),
    ).toHaveLength(201);
    const firstUrl = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(firstUrl.searchParams.get("after")).toBe("1788220800");
    expect(firstUrl.searchParams.get("per_page")).toBe("200");
    expect(fetchImpl.mock.calls[0][1]?.headers).toEqual({
      Authorization: "Bearer token",
    });
  });

  it("reports rate limiting with a retry delay", async () => {
    const fetchImpl = vi
      .fn<Fetch>()
      .mockResolvedValue(
        new Response("", { status: 429, headers: { "Retry-After": "120" } }),
      );
    await expect(
      fetchStravaRecords(fetchImpl, "token", new Date()),
    ).rejects.toMatchObject({ code: "rate_limited", retryAfterSeconds: 120 });
  });
});
