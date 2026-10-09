import { describe, expect, it } from "vitest";

import { buildContentSecurityPolicy } from "./csp";

const directive = (csp: string, name: string) =>
  csp
    .split("; ")
    .find((part) => part.startsWith(`${name} `))
    ?.slice(name.length + 1);

describe("buildContentSecurityPolicy", () => {
  const production = buildContentSecurityPolicy({
    supabaseUrl: "https://abc.supabase.co",
    development: false,
  });

  it("allows Supabase over HTTPS and websockets only", () => {
    expect(directive(production, "connect-src")).toBe(
      "'self' https://abc.supabase.co wss://abc.supabase.co",
    );
  });

  it("forbids framing, plugins, foreign forms and eval in production", () => {
    expect(directive(production, "frame-ancestors")).toBe("'none'");
    expect(directive(production, "object-src")).toBe("'none'");
    expect(directive(production, "form-action")).toBe("'self'");
    expect(directive(production, "script-src")).not.toContain("unsafe-eval");
    expect(production).toContain("upgrade-insecure-requests");
  });

  it("relaxes only what development tooling needs", () => {
    const development = buildContentSecurityPolicy({
      supabaseUrl: "http://127.0.0.1:54321",
      development: true,
    });
    expect(directive(development, "script-src")).toContain("'unsafe-eval'");
    expect(directive(development, "connect-src")).toBe(
      "'self' http://127.0.0.1:54321 ws://127.0.0.1:54321 ws:",
    );
    expect(development).not.toContain("upgrade-insecure-requests");
  });

  it("ignores a missing or malformed Supabase URL", () => {
    for (const supabaseUrl of [undefined, "", "javascript:alert(1)"]) {
      const csp = buildContentSecurityPolicy({
        supabaseUrl,
        development: false,
      });
      expect(directive(csp, "connect-src")).toBe("'self'");
    }
  });
});
