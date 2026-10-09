import { z } from "zod";

import {
  ProviderError,
  type Fetch,
  type NormalizedRecord,
  type OAuthTokens,
} from "./types";

/**
 * Strava adapter (spec §17). OAuth 2.0 + the athlete activities list,
 * normalised into canonical records. Network calls take an injectable
 * `fetch` so they are tested without the network.
 */

export const STRAVA_AUTHORIZE_URL = "https://www.strava.com/oauth/authorize";
export const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
export const STRAVA_DEAUTHORIZE_URL =
  "https://www.strava.com/oauth/deauthorize";
export const STRAVA_ACTIVITIES_URL =
  "https://www.strava.com/api/v3/athlete/activities";

/**
 * Least privilege for importing your own activities: read activities,
 * including "only me" ones (many runners keep runs private). Strava lets
 * the user untick private access on the consent screen; the scopes
 * actually granted are stored and shown.
 */
export const STRAVA_SCOPES = ["activity:read_all"] as const;

/** Page size the API allows at most; fewer requests, kinder to limits. */
const PAGE_SIZE = 200;
/** Safety cap per sync (200 × 25 = 5 000 activities). */
const MAX_PAGES = 25;

export function stravaAuthorizeUrl({
  clientId,
  redirectUri,
  state,
}: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(STRAVA_AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    approval_prompt: "auto",
    scope: STRAVA_SCOPES.join(","),
    state,
  }).toString();
  return url.toString();
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_at: z.number().int().positive(),
  athlete: z.object({ id: z.union([z.number(), z.string()]) }).optional(),
});

function failure(response: Response): ProviderError {
  if (response.status === 401 || response.status === 403)
    return new ProviderError("strava", "unauthorized");
  if (response.status === 429) {
    const retry = Number(response.headers.get("retry-after"));
    return new ProviderError(
      "strava",
      "rate_limited",
      Number.isFinite(retry) && retry > 0 ? retry : 15 * 60,
    );
  }
  return new ProviderError(
    "strava",
    response.status >= 500 ? "unavailable" : "bad_response",
  );
}

async function tokenRequest(
  fetchImpl: Fetch,
  body: Record<string, string>,
  grantedScopes: string[],
  previousUserId: string | null,
): Promise<OAuthTokens> {
  const response = await fetchImpl(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
    cache: "no-store",
  });
  if (!response.ok) throw failure(response);
  const parsed = tokenResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new ProviderError("strava", "bad_response");
  return {
    accessToken: parsed.data.access_token,
    refreshToken: parsed.data.refresh_token,
    expiresAt: new Date(parsed.data.expires_at * 1000),
    scopes: grantedScopes,
    providerUserId:
      parsed.data.athlete !== undefined
        ? String(parsed.data.athlete.id)
        : previousUserId,
  };
}

/** Exchanges the authorization code. `scope` is what the user granted. */
export function exchangeStravaCode(
  fetchImpl: Fetch,
  {
    clientId,
    clientSecret,
    code,
    scope,
  }: { clientId: string; clientSecret: string; code: string; scope: string },
): Promise<OAuthTokens> {
  return tokenRequest(
    fetchImpl,
    {
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
    },
    parseGrantedScopes(scope),
    null,
  );
}

/** Strava rotates refresh tokens: always store the returned one. */
export function refreshStravaToken(
  fetchImpl: Fetch,
  {
    clientId,
    clientSecret,
    refreshToken,
    scopes,
    providerUserId,
  }: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    scopes: string[];
    providerUserId: string | null;
  },
): Promise<OAuthTokens> {
  return tokenRequest(
    fetchImpl,
    {
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    },
    scopes,
    providerUserId,
  );
}

export function parseGrantedScopes(scope: string | null): string[] {
  return (scope ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .sort();
}

/** Activities are readable only with an activity scope. */
export function canReadActivities(scopes: readonly string[]): boolean {
  return scopes.some((s) => s === "activity:read" || s === "activity:read_all");
}

export async function deauthorizeStrava(
  fetchImpl: Fetch,
  accessToken: string,
): Promise<void> {
  const response = await fetchImpl(STRAVA_DEAUTHORIZE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  // Already revoked on Strava's side is fine.
  if (!response.ok && response.status !== 401) throw failure(response);
}

const activitySchema = z.object({
  id: z.union([z.number(), z.string()]),
  sport_type: z.string().optional(),
  type: z.string().optional(),
  distance: z.number().nonnegative().optional(),
  moving_time: z.number().nonnegative().optional(),
  total_elevation_gain: z.number().optional(),
  start_date: z.string(),
});

export type StravaActivity = z.infer<typeof activitySchema>;

const RUN_TYPES = new Set(["Run", "TrailRun", "VirtualRun"]);
const RIDE_TYPES = new Set([
  "Ride",
  "MountainBikeRide",
  "GravelRide",
  "EBikeRide",
  "EMountainBikeRide",
  "VirtualRide",
  "Velomobile",
]);

const round = (value: number, digits: number) =>
  Math.round(value * 10 ** digits) / 10 ** digits;

/** One Strava activity → canonical records (spec §17). */
export function normalizeStravaActivity(
  activity: StravaActivity,
): NormalizedRecord[] {
  const occurredAt = new Date(activity.start_date);
  if (Number.isNaN(occurredAt.getTime())) return [];
  const sport = activity.sport_type ?? activity.type ?? "Workout";
  const base = {
    occurredAt,
    externalRecordId: String(activity.id),
    attributes: { sportType: sport },
  };
  const distanceKm = round((activity.distance ?? 0) / 1000, 3);
  const records: NormalizedRecord[] = [
    { ...base, sourceMetric: "strava.activity_count", value: 1 },
    {
      ...base,
      sourceMetric: "strava.moving_minutes",
      value: round((activity.moving_time ?? 0) / 60, 1),
    },
  ];
  if (activity.total_elevation_gain !== undefined)
    records.push({
      ...base,
      sourceMetric: "strava.elevation_gain_m",
      value: round(Math.max(0, activity.total_elevation_gain), 1),
    });
  if (RUN_TYPES.has(sport)) {
    records.push(
      { ...base, sourceMetric: "strava.run_distance_km", value: distanceKm },
      { ...base, sourceMetric: "strava.run_count", value: 1 },
    );
  }
  if (RIDE_TYPES.has(sport))
    records.push({
      ...base,
      sourceMetric: "strava.ride_distance_km",
      value: distanceKm,
    });
  return records;
}

/**
 * All activities that started after `after`, normalised. Pages until a
 * short page; malformed items are skipped rather than failing the sync.
 */
export async function fetchStravaRecords(
  fetchImpl: Fetch,
  accessToken: string,
  after: Date,
): Promise<{ records: NormalizedRecord[]; activityIds: string[] }> {
  const records: NormalizedRecord[] = [];
  const activityIds: string[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = new URL(STRAVA_ACTIVITIES_URL);
    url.search = new URLSearchParams({
      after: String(Math.floor(after.getTime() / 1000)),
      page: String(page),
      per_page: String(PAGE_SIZE),
    }).toString();
    const response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!response.ok) throw failure(response);
    const body: unknown = await response.json();
    if (!Array.isArray(body)) throw new ProviderError("strava", "bad_response");
    for (const item of body) {
      const parsed = activitySchema.safeParse(item);
      if (!parsed.success) continue;
      activityIds.push(String(parsed.data.id));
      records.push(...normalizeStravaActivity(parsed.data));
    }
    if (body.length < PAGE_SIZE) break;
  }
  return { records, activityIds };
}
