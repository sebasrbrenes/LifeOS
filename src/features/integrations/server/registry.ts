import "server-only";

import { getPublicEnv } from "@/lib/env/public";
import { getServerEnv } from "@/lib/env/server";
import { providerAvailability } from "@/lib/env/server-schema";
import {
  canReadCalendarEvents,
  exchangeGoogleCode,
  fetchCalendarRecords,
  googleAuthorizeUrl,
  refreshGoogleToken,
  revokeGoogleToken,
} from "@/lib/integrations/google-calendar";
import { parseSourceFilter } from "@/lib/integrations/reconcile";
import {
  canReadActivities,
  deauthorizeStrava,
  exchangeStravaCode,
  fetchStravaRecords,
  refreshStravaToken,
  stravaAuthorizeUrl,
} from "@/lib/integrations/strava";
import type { SyncAdapter } from "@/lib/integrations/sync";
import type {
  IntegrationProvider,
  OAuthTokens,
} from "@/lib/integrations/types";

/** Everything the routes and sync need from a provider, wired to env. */
export type ProviderClient = SyncAdapter & {
  name: string;
  authorizeUrl(state: string): string;
  exchange(params: URLSearchParams): Promise<OAuthTokens>;
  revoke(tokens: OAuthTokens): Promise<void>;
};

export function isIntegrationProvider(
  value: string,
): value is IntegrationProvider {
  return value === "strava" || value === "google_calendar";
}

export function redirectUri(provider: IntegrationProvider): string {
  return new URL(
    `/integrations/${provider}/callback`,
    getPublicEnv().NEXT_PUBLIC_APP_URL,
  ).toString();
}

/** The configured client, or null when the server lacks its secrets. */
export function providerClient(
  provider: IntegrationProvider,
): ProviderClient | null {
  const env = getServerEnv();
  if (providerAvailability(env, provider).state !== "ready") return null;
  const now = () => new Date();

  if (provider === "strava") {
    const clientId = env.STRAVA_CLIENT_ID!;
    const clientSecret = env.STRAVA_CLIENT_SECRET!;
    return {
      provider,
      name: "Strava",
      authorizeUrl: (state) =>
        stravaAuthorizeUrl({
          clientId,
          redirectUri: redirectUri(provider),
          state,
        }),
      exchange: (params) =>
        exchangeStravaCode(fetch, {
          clientId,
          clientSecret,
          code: params.get("code") ?? "",
          scope: params.get("scope") ?? "",
        }),
      refresh: (tokens) =>
        refreshStravaToken(fetch, {
          clientId,
          clientSecret,
          refreshToken: tokens.refreshToken ?? "",
          scopes: tokens.scopes,
          providerUserId: tokens.providerUserId,
        }),
      revoke: (tokens) => deauthorizeStrava(fetch, tokens.accessToken),
      canRead: canReadActivities,
      fetchRecords: async (accessToken, window) =>
        (await fetchStravaRecords(fetch, accessToken, window.from)).records,
    };
  }

  const clientId = env.GOOGLE_CLIENT_ID!;
  const clientSecret = env.GOOGLE_CLIENT_SECRET!;
  return {
    provider,
    name: "Google Calendar",
    authorizeUrl: (state) =>
      googleAuthorizeUrl({
        clientId,
        redirectUri: redirectUri(provider),
        state,
      }),
    exchange: (params) =>
      exchangeGoogleCode(fetch, {
        clientId,
        clientSecret,
        code: params.get("code") ?? "",
        redirectUri: redirectUri(provider),
        now: now(),
      }),
    refresh: (tokens) =>
      refreshGoogleToken(fetch, {
        clientId,
        clientSecret,
        refreshToken: tokens.refreshToken ?? "",
        scopes: tokens.scopes,
        now: now(),
      }),
    revoke: (tokens) =>
      revokeGoogleToken(fetch, tokens.refreshToken ?? tokens.accessToken),
    canRead: canReadCalendarEvents,
    fetchRecords: (accessToken, window, metrics) => {
      // Read the primary calendar plus any calendar a metric names.
      const calendars = new Set(["primary"]);
      for (const metric of metrics)
        for (const id of parseSourceFilter(metric.sourceFilter)?.calendarIds ??
          [])
          calendars.add(id);
      return fetchCalendarRecords(
        fetch,
        accessToken,
        [...calendars],
        window.from,
        window.to,
      );
    },
  };
}
