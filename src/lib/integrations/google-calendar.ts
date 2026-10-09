import { z } from "zod";

import {
  ProviderError,
  type Fetch,
  type NormalizedRecord,
  type OAuthTokens,
} from "./types";

/**
 * Google Calendar adapter (spec §18). Read-only and least privilege: the
 * events of calendars the user names (default: their primary calendar).
 * A calendar event is *planned* time — it never counts as completed
 * because it existed; completion comes from commitments or other sources.
 */

export const GOOGLE_AUTHORIZE_URL =
  "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const EVENTS_URL = (calendarId: string) =>
  `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;

/** Read events only — no calendar list, no write access. */
export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events.readonly",
] as const;

const MAX_PAGES = 20;

export function googleAuthorizeUrl({
  clientId,
  redirectUri,
  state,
}: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(GOOGLE_AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPES.join(" "),
    // A refresh token, so syncs work without the user present.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    state,
  }).toString();
  return url.toString();
}

const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(),
});

function failure(response: Response): ProviderError {
  if (response.status === 400 || response.status === 401)
    return new ProviderError("google_calendar", "unauthorized");
  if (response.status === 403 || response.status === 429) {
    const retry = Number(response.headers.get("retry-after"));
    return new ProviderError(
      "google_calendar",
      "rate_limited",
      Number.isFinite(retry) && retry > 0 ? retry : 60,
    );
  }
  return new ProviderError(
    "google_calendar",
    response.status >= 500 ? "unavailable" : "bad_response",
  );
}

async function tokenRequest(
  fetchImpl: Fetch,
  body: Record<string, string>,
  now: Date,
  previous: Pick<OAuthTokens, "refreshToken" | "scopes"> | null,
): Promise<OAuthTokens> {
  const response = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
    cache: "no-store",
  });
  if (!response.ok) throw failure(response);
  const parsed = tokenSchema.safeParse(await response.json());
  if (!parsed.success)
    throw new ProviderError("google_calendar", "bad_response");
  return {
    accessToken: parsed.data.access_token,
    // Google returns a refresh token on first consent only; keep the old one.
    refreshToken: parsed.data.refresh_token ?? previous?.refreshToken ?? null,
    expiresAt: new Date(now.getTime() + parsed.data.expires_in * 1000),
    scopes: parsed.data.scope
      ? parsed.data.scope.split(" ").filter(Boolean).sort()
      : (previous?.scopes ?? []),
    providerUserId: null,
  };
}

export function exchangeGoogleCode(
  fetchImpl: Fetch,
  {
    clientId,
    clientSecret,
    code,
    redirectUri,
    now,
  }: {
    clientId: string;
    clientSecret: string;
    code: string;
    redirectUri: string;
    now: Date;
  },
): Promise<OAuthTokens> {
  return tokenRequest(
    fetchImpl,
    {
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    },
    now,
    null,
  );
}

export function refreshGoogleToken(
  fetchImpl: Fetch,
  {
    clientId,
    clientSecret,
    refreshToken,
    scopes,
    now,
  }: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    scopes: string[];
    now: Date;
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
    now,
    { refreshToken, scopes },
  );
}

export function canReadCalendarEvents(scopes: readonly string[]): boolean {
  return scopes.some((s) =>
    [
      "https://www.googleapis.com/auth/calendar.events.readonly",
      "https://www.googleapis.com/auth/calendar.readonly",
    ].includes(s),
  );
}

export async function revokeGoogleToken(
  fetchImpl: Fetch,
  token: string,
): Promise<void> {
  const response = await fetchImpl(GOOGLE_REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }).toString(),
    cache: "no-store",
  });
  // 400 = already revoked or expired: the goal is reached.
  if (!response.ok && response.status !== 400) throw failure(response);
}

const eventSchema = z.object({
  id: z.string().min(1),
  status: z.string().optional(),
  summary: z.string().optional(),
  transparency: z.string().optional(),
  start: z.object({
    dateTime: z.string().optional(),
    date: z.string().optional(),
  }),
  end: z.object({
    dateTime: z.string().optional(),
    date: z.string().optional(),
  }),
  attendees: z
    .array(
      z.object({
        self: z.boolean().optional(),
        responseStatus: z.string().optional(),
      }),
    )
    .optional(),
});

export type CalendarEvent = z.infer<typeof eventSchema>;

/**
 * One event → planned minutes and one planned block. Skipped: cancelled,
 * declined, all-day (no duration) and "free" (transparent) events.
 */
export function normalizeCalendarEvent(
  event: CalendarEvent,
  calendarId: string,
): NormalizedRecord[] {
  if (event.status === "cancelled" || event.transparency === "transparent")
    return [];
  if (event.attendees?.some((a) => a.self && a.responseStatus === "declined"))
    return [];
  if (!event.start.dateTime || !event.end.dateTime) return [];
  const start = new Date(event.start.dateTime);
  const end = new Date(event.end.dateTime);
  const minutes = Math.round((end.getTime() - start.getTime()) / 60_000);
  if (!Number.isFinite(minutes) || minutes <= 0) return [];
  const base = {
    occurredAt: start,
    externalRecordId: `${calendarId}:${event.id}`.slice(0, 200),
    // The title is only used in memory to match title filters; it is never
    // stored.
    attributes: { calendarId, title: event.summary ?? "" },
  };
  return [
    {
      ...base,
      sourceMetric: "google_calendar.planned_minutes",
      value: minutes,
    },
    { ...base, sourceMetric: "google_calendar.planned_blocks", value: 1 },
  ];
}

/**
 * Events that started in [from, to) on the given calendars, expanded
 * (recurring events become instances), normalised.
 */
export async function fetchCalendarRecords(
  fetchImpl: Fetch,
  accessToken: string,
  calendarIds: readonly string[],
  from: Date,
  to: Date,
): Promise<NormalizedRecord[]> {
  const records: NormalizedRecord[] = [];
  for (const calendarId of calendarIds) {
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const url = new URL(EVENTS_URL(calendarId));
      url.search = new URLSearchParams({
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "2500",
        fields:
          "nextPageToken,items(id,status,summary,transparency,start,end,attendees(self,responseStatus))",
        ...(pageToken ? { pageToken } : {}),
      }).toString();
      const response = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      if (!response.ok) throw failure(response);
      const body = z
        .object({
          items: z.array(z.unknown()).default([]),
          nextPageToken: z.string().optional(),
        })
        .safeParse(await response.json());
      if (!body.success)
        throw new ProviderError("google_calendar", "bad_response");
      for (const item of body.data.items) {
        const event = eventSchema.safeParse(item);
        if (event.success)
          records.push(...normalizeCalendarEvent(event.data, calendarId));
      }
      pageToken = body.data.nextPageToken;
      if (!pageToken) break;
    }
  }
  return records;
}
