import { describe, expect, it } from "vitest";

import { EnvValidationError, parseEnv } from "./parse";
import { publicEnvSchema } from "./public";

const valid = {
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
};

describe("parseEnv", () => {
  it("returns typed values when every variable is valid", () => {
    expect(parseEnv("public", publicEnvSchema, valid)).toEqual(valid);
  });

  it("reports missing variables as required", () => {
    const run = () =>
      parseEnv("public", publicEnvSchema, {
        ...valid,
        NEXT_PUBLIC_SUPABASE_URL: undefined,
      });

    expect(run).toThrow(EnvValidationError);
    expect(run).toThrow("NEXT_PUBLIC_SUPABASE_URL: is required");
  });

  it("treats empty strings as missing", () => {
    expect(() =>
      parseEnv("public", publicEnvSchema, {
        ...valid,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      }),
    ).toThrow("NEXT_PUBLIC_SUPABASE_ANON_KEY: is required");
  });

  it("rejects non-http URLs", () => {
    expect(() =>
      parseEnv("public", publicEnvSchema, {
        ...valid,
        NEXT_PUBLIC_APP_URL: "javascript:alert(1)",
      }),
    ).toThrow("NEXT_PUBLIC_APP_URL");
  });

  it("never echoes the offending value in the error message", () => {
    const secretLookingValue = "not a url but sensitive-123";
    try {
      parseEnv("public", publicEnvSchema, {
        ...valid,
        NEXT_PUBLIC_SUPABASE_URL: secretLookingValue,
      });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain(secretLookingValue);
    }
  });

  it("lists every invalid variable at once", () => {
    try {
      parseEnv("public", publicEnvSchema, {});
      expect.unreachable();
    } catch (error) {
      const message = String(error);
      expect(message).toContain("NEXT_PUBLIC_APP_URL");
      expect(message).toContain("NEXT_PUBLIC_SUPABASE_URL");
      expect(message).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    }
  });
});
