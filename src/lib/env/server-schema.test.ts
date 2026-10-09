import { describe, expect, it } from "vitest";

import { parseEnv } from "./parse";
import { providerAvailability, serverEnvSchema } from "./server-schema";

const KEY = Buffer.alloc(32, 7).toString("base64");

describe("serverEnvSchema", () => {
  it("accepts an empty environment: integrations are optional", () => {
    expect(parseEnv("server", serverEnvSchema, {})).toEqual({});
  });

  it("validates present values without echoing them", () => {
    const secret = "not-base64-and-secret";
    try {
      parseEnv("server", serverEnvSchema, {
        TOKEN_ENCRYPTION_KEY: secret,
        STRAVA_CLIENT_ID: "abc",
      });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).toContain("TOKEN_ENCRYPTION_KEY");
      expect(String(error)).toContain("STRAVA_CLIENT_ID");
      expect(String(error)).not.toContain(secret);
    }
  });

  it("requires a 32-byte encryption key", () => {
    expect(
      serverEnvSchema.safeParse({
        TOKEN_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64"),
      }).success,
    ).toBe(false);
    expect(
      serverEnvSchema.safeParse({ TOKEN_ENCRYPTION_KEY: KEY }).success,
    ).toBe(true);
  });
});

describe("providerAvailability", () => {
  it("lists the missing variables by name", () => {
    expect(
      providerAvailability({ TOKEN_ENCRYPTION_KEY: KEY }, "strava"),
    ).toEqual({
      state: "not_configured",
      missing: [
        "SUPABASE_SERVICE_ROLE_KEY",
        "STRAVA_CLIENT_ID",
        "STRAVA_CLIENT_SECRET",
      ],
    });
  });

  it("is ready once the provider and shared secrets exist", () => {
    expect(
      providerAvailability(
        {
          SUPABASE_SERVICE_ROLE_KEY: "service-role-key-xxxxxxxx",
          TOKEN_ENCRYPTION_KEY: KEY,
          GOOGLE_CLIENT_ID: "123-abc.apps.googleusercontent.com",
          GOOGLE_CLIENT_SECRET: "secret-xxxxxxx",
        },
        "google_calendar",
      ),
    ).toEqual({ state: "ready" });
  });

  it("keeps Google Health unavailable (spec §16) and GitHub unbuilt", () => {
    expect(
      providerAvailability({ GOOGLE_HEALTH_ENABLED: "true" }, "google_health"),
    ).toEqual({ state: "unavailable", reason: "provider_closed" });
    expect(providerAvailability({}, "github").state).toBe("unavailable");
  });
});
