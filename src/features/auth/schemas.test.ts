import { describe, expect, it } from "vitest";

import {
  forgotPasswordSchema,
  parseFormData,
  signInSchema,
  signUpSchema,
  updatePasswordSchema,
} from "./schemas";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
}

describe("signInSchema", () => {
  it("normalizes the email", () => {
    const result = parseFormData(
      signInSchema,
      form({ email: "  Seb@Example.COM ", password: "x" }),
    );
    expect(result).toEqual({
      success: true,
      data: { email: "seb@example.com", password: "x" },
    });
  });

  it("does not apply new-password length rules", () => {
    const result = parseFormData(
      signInSchema,
      form({ email: "a@b.co", password: "short" }),
    );
    expect(result.success).toBe(true);
  });

  it("requires a password", () => {
    const result = parseFormData(
      signInSchema,
      form({ email: "a@b.co", password: "" }),
    );
    expect(result).toEqual({
      success: false,
      fieldErrors: { password: "Introduce tu contraseña." },
    });
  });

  it("rejects malformed emails", () => {
    const result = parseFormData(
      signInSchema,
      form({ email: "not-an-email", password: "x" }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors.email).toBe("Introduce un email válido.");
    }
  });

  it("reports missing fields instead of throwing", () => {
    const result = parseFormData(signInSchema, form({}));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors.email).toBeDefined();
      expect(result.fieldErrors.password).toBeDefined();
    }
  });

  it("ignores React internal action fields", () => {
    const result = parseFormData(
      signInSchema,
      form({ email: "a@b.co", password: "x", $ACTION_ID_abc: "" }),
    );
    expect(result.success).toBe(true);
  });
});

describe("signUpSchema", () => {
  const base = { email: "a@b.co", password: "12345678" };

  it("accepts a valid sign-up", () => {
    const result = parseFormData(
      signUpSchema,
      form({ ...base, confirmPassword: "12345678" }),
    );
    expect(result.success).toBe(true);
  });

  it("passes a well-formed browser timezone through", () => {
    const result = parseFormData(
      signUpSchema,
      form({
        ...base,
        confirmPassword: "12345678",
        timezone: "America/Argentina/Buenos_Aires",
      }),
    );
    expect(result.success && result.data.timezone).toBe(
      "America/Argentina/Buenos_Aires",
    );
  });

  it.each([[""], ["../etc/passwd"], ["a".repeat(65)], ["Europe/Madrid; drop"]])(
    "drops a malformed timezone %j instead of failing sign-up",
    (timezone) => {
      const result = parseFormData(
        signUpSchema,
        form({ ...base, confirmPassword: "12345678", timezone }),
      );
      expect(result.success).toBe(true);
      expect(result.success && result.data.timezone).toBeUndefined();
    },
  );

  it("enforces the 8-character minimum at the boundary", () => {
    const result = parseFormData(
      signUpSchema,
      form({ ...base, password: "1234567", confirmPassword: "1234567" }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors.password).toMatch(/al menos 8/);
    }
  });

  it("enforces the 72-character bcrypt maximum", () => {
    const long = "a".repeat(73);
    const result = parseFormData(
      signUpSchema,
      form({ ...base, password: long, confirmPassword: long }),
    );
    expect(result.success).toBe(false);
  });

  it("requires matching confirmation", () => {
    const result = parseFormData(
      signUpSchema,
      form({ ...base, confirmPassword: "different" }),
    );
    expect(result).toEqual({
      success: false,
      fieldErrors: { confirmPassword: "Las contraseñas no coinciden." },
    });
  });
});

describe("forgotPasswordSchema", () => {
  it("only needs an email", () => {
    expect(
      parseFormData(forgotPasswordSchema, form({ email: "a@b.co" })).success,
    ).toBe(true);
  });
});

describe("updatePasswordSchema", () => {
  it("requires matching passwords of valid length", () => {
    expect(
      parseFormData(
        updatePasswordSchema,
        form({ password: "abcdefgh", confirmPassword: "abcdefgh" }),
      ).success,
    ).toBe(true);
    expect(
      parseFormData(
        updatePasswordSchema,
        form({ password: "abcdefgh", confirmPassword: "abcdefgX" }),
      ).success,
    ).toBe(false);
  });
});
