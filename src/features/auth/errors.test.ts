import { describe, expect, it } from "vitest";

import { authErrorMessage } from "./errors";

describe("authErrorMessage", () => {
  it("uses one message for wrong email or password", () => {
    expect(authErrorMessage({ code: "invalid_credentials" }, "sign-in")).toBe(
      "Email o contraseña incorrectos.",
    );
  });

  it("does not confirm that an account exists on sign-up", () => {
    const message = authErrorMessage(
      { code: "user_already_exists" },
      "sign-up",
    );
    expect(message).not.toMatch(/ya existe/i);
    expect(message).toMatch(/Si ya tienes cuenta/);
  });

  it("explains expired recovery links in the password update flow", () => {
    expect(
      authErrorMessage({ code: "session_not_found" }, "update-password"),
    ).toMatch(/enlace de recuperación/);
  });

  it.each([
    [{ code: "over_email_send_rate_limit" }],
    [{ code: "over_request_rate_limit" }],
    [{ status: 429 }],
  ])("maps rate limiting %j", (error) => {
    expect(authErrorMessage(error, "forgot-password")).toMatch(
      /Demasiados intentos/,
    );
  });

  it("maps network failures", () => {
    expect(authErrorMessage({ status: 0 }, "sign-in")).toMatch(/conectar/);
  });

  it("falls back to a generic message for unknown errors", () => {
    expect(authErrorMessage({ code: "something_new" }, "sign-in")).toBe(
      "Algo salió mal. Inténtalo de nuevo.",
    );
    expect(authErrorMessage({}, "sign-in")).toBe(
      "Algo salió mal. Inténtalo de nuevo.",
    );
  });
});
