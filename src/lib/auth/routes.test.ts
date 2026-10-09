import { describe, expect, it } from "vitest";

import { classifyRoute, resolveAuthRedirect, safeNextPath } from "./routes";

describe("classifyRoute", () => {
  it.each([
    ["/login", "guest-only"],
    ["/signup", "guest-only"],
    ["/forgot-password", "guest-only"],
    ["/auth/confirm", "public"],
    ["/offline", "public"],
    ["/api/cron/sync", "public"],
    ["/offline/x", "protected"],
    ["/dashboard", "protected"],
    ["/settings", "protected"],
    ["/reset-password", "protected"],
    ["/", "protected"],
    // Prefix lookalikes must not inherit guest/public access.
    ["/login-history", "protected"],
    ["/authors", "protected"],
  ] as const)("%s → %s", (pathname, expected) => {
    expect(classifyRoute(pathname)).toBe(expected);
  });
});

describe("safeNextPath", () => {
  it.each([
    ["/dashboard", "/dashboard"],
    ["/settings?tab=account", "/settings?tab=account"],
    ["/score#career", "/score#career"],
  ])("keeps same-origin path %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    [null],
    [undefined],
    [""],
    ["dashboard"],
    ["https://evil.example"],
    ["//evil.example"],
    ["/\\evil.example"],
    ["/\t/evil.example"],
    ["javascript:alert(1)"],
  ])("falls back to /dashboard for unsafe value %j", (input) => {
    expect(safeNextPath(input)).toBe("/dashboard");
  });

  it("does not redirect back to guest-only pages", () => {
    expect(safeNextPath("/login")).toBe("/dashboard");
    expect(safeNextPath("/signup?x=1")).toBe("/dashboard");
  });

  it("normalizes dot segments without escaping the origin", () => {
    expect(safeNextPath("/a/../settings")).toBe("/settings");
  });
});

describe("resolveAuthRedirect", () => {
  it("sends signed-out users from protected pages to login with next", () => {
    expect(resolveAuthRedirect("/settings", "?tab=a", false)).toBe(
      "/login?next=%2Fsettings%3Ftab%3Da",
    );
  });

  it("lets signed-in users reach protected pages", () => {
    expect(resolveAuthRedirect("/dashboard", "", true)).toBeNull();
  });

  it("lets signed-out users reach guest-only pages", () => {
    expect(resolveAuthRedirect("/login", "", false)).toBeNull();
  });

  it("sends signed-in users away from guest-only pages", () => {
    expect(resolveAuthRedirect("/login", "", true)).toBe("/dashboard");
  });

  it("honours a safe next param when bouncing signed-in users", () => {
    expect(resolveAuthRedirect("/login", "?next=%2Fsettings", true)).toBe(
      "/settings",
    );
  });

  it("ignores an unsafe next param when bouncing signed-in users", () => {
    expect(
      resolveAuthRedirect("/login", "?next=https%3A%2F%2Fevil.example", true),
    ).toBe("/dashboard");
  });

  it("never redirects public auth callbacks", () => {
    expect(resolveAuthRedirect("/auth/confirm", "?code=x", false)).toBeNull();
    expect(resolveAuthRedirect("/auth/confirm", "?code=x", true)).toBeNull();
  });
});
