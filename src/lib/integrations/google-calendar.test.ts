import { describe, expect, it, vi } from "vitest";

import {
  canReadCalendarEvents,
  exchangeGoogleCode,
  fetchCalendarRecords,
  googleAuthorizeUrl,
  normalizeCalendarEvent,
  refreshGoogleToken,
} from "./google-calendar";
import type { Fetch } from "./types";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const block = {
  id: "evt1",
  summary: "Estudio QA",
  start: { dateTime: "2026-10-05T18:00:00+02:00" },
  end: { dateTime: "2026-10-05T19:30:00+02:00" },
};

describe("googleAuthorizeUrl", () => {
  it("requests read-only events and a refresh token", () => {
    const params = new URL(
      googleAuthorizeUrl({
        clientId: "id",
        redirectUri: "http://x/cb",
        state: "s",
      }),
    ).searchParams;
    expect(params.get("scope")).toBe(
      "https://www.googleapis.com/auth/calendar.events.readonly",
    );
    expect(params.get("access_type")).toBe("offline");
    expect(params.get("state")).toBe("s");
  });
});

describe("tokens", () => {
  const now = new Date("2026-10-07T10:00:00Z");

  it("exchanges the code and computes expiry", async () => {
    const fetchImpl = vi.fn<Fetch>().mockResolvedValue(
      json({
        access_token: "a1",
        refresh_token: "r1",
        expires_in: 3599,
        scope: "https://www.googleapis.com/auth/calendar.events.readonly",
        token_type: "Bearer",
      }),
    );
    const tokens = await exchangeGoogleCode(fetchImpl, {
      clientId: "id",
      clientSecret: "secret",
      code: "c",
      redirectUri: "http://x/cb",
      now,
    });
    expect(tokens).toMatchObject({
      accessToken: "a1",
      refreshToken: "r1",
      expiresAt: new Date("2026-10-07T10:59:59Z"),
    });
    expect(canReadCalendarEvents(tokens.scopes)).toBe(true);
  });

  it("keeps the refresh token Google doesn't resend", async () => {
    const fetchImpl = vi
      .fn<Fetch>()
      .mockResolvedValue(json({ access_token: "a2", expires_in: 3600 }));
    const tokens = await refreshGoogleToken(fetchImpl, {
      clientId: "id",
      clientSecret: "secret",
      refreshToken: "r1",
      scopes: ["s"],
      now,
    });
    expect(tokens).toMatchObject({
      accessToken: "a2",
      refreshToken: "r1",
      scopes: ["s"],
    });
  });

  it("treats invalid_grant as revoked access", async () => {
    const fetchImpl = vi
      .fn<Fetch>()
      .mockResolvedValue(json({ error: "invalid_grant" }, 400));
    await expect(
      refreshGoogleToken(fetchImpl, {
        clientId: "id",
        clientSecret: "secret",
        refreshToken: "r1",
        scopes: [],
        now,
      }),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });
});

describe("normalizeCalendarEvent", () => {
  it("records planned minutes and a block, keyed by calendar and event", () => {
    const records = normalizeCalendarEvent(block, "primary");
    expect(records.map((r) => [r.sourceMetric, r.value])).toEqual([
      ["google_calendar.planned_minutes", 90],
      ["google_calendar.planned_blocks", 1],
    ]);
    expect(records[0].externalRecordId).toBe("primary:evt1");
    expect(records[0].occurredAt.toISOString()).toBe(
      "2026-10-05T16:00:00.000Z",
    );
    expect(records[0].attributes).toEqual({
      calendarId: "primary",
      title: "Estudio QA",
    });
  });

  it("ignores events that aren't planned time", () => {
    expect(
      normalizeCalendarEvent({ ...block, status: "cancelled" }, "p"),
    ).toEqual([]);
    expect(
      normalizeCalendarEvent({ ...block, transparency: "transparent" }, "p"),
    ).toEqual([]);
    expect(
      normalizeCalendarEvent(
        { ...block, attendees: [{ self: true, responseStatus: "declined" }] },
        "p",
      ),
    ).toEqual([]);
    expect(
      normalizeCalendarEvent(
        {
          id: "allday",
          start: { date: "2026-10-05" },
          end: { date: "2026-10-06" },
        },
        "p",
      ),
    ).toEqual([]);
  });
});

describe("fetchCalendarRecords", () => {
  it("expands recurring events, follows pages and reads each calendar", async () => {
    const fetchImpl = vi
      .fn<Fetch>()
      .mockResolvedValueOnce(json({ items: [block], nextPageToken: "p2" }))
      .mockResolvedValueOnce(
        json({ items: [{ ...block, id: "evt2" }, { bad: 1 }] }),
      )
      .mockResolvedValueOnce(json({ items: [] }));
    const records = await fetchCalendarRecords(
      fetchImpl,
      "token",
      ["primary", "work@group.calendar.google.com"],
      new Date("2026-09-07T00:00:00Z"),
      new Date("2026-10-07T00:00:00Z"),
    );
    expect(
      records.filter((r) => r.sourceMetric.endsWith("blocks")),
    ).toHaveLength(2);
    const first = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(first.pathname).toBe("/calendar/v3/calendars/primary/events");
    expect(first.searchParams.get("singleEvents")).toBe("true");
    expect(
      new URL(String(fetchImpl.mock.calls[1][0])).searchParams.get("pageToken"),
    ).toBe("p2");
    expect(new URL(String(fetchImpl.mock.calls[2][0])).pathname).toBe(
      "/calendar/v3/calendars/work%40group.calendar.google.com/events",
    );
  });
});
