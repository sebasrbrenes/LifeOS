import { describe, expect, it } from "vitest";

import { integrationNotice } from "./notices";

describe("integrationNotice", () => {
  it("explains known errors and ignores unknown codes", () => {
    expect(integrationNotice({ error: "denied" })).toMatchObject({
      status: "error",
    });
    expect(integrationNotice({ error: "<script>" })).toBeNull();
    expect(integrationNotice({})).toBeNull();
  });

  it("confirms a connection, with errors taking precedence", () => {
    expect(integrationNotice({ connected: "strava" })?.message).toContain(
      "Strava conectado",
    );
    expect(
      integrationNotice({ connected: "strava", error: "first_sync_failed" })
        ?.status,
    ).toBe("error");
  });
});
