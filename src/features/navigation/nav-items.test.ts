import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { NAV_ITEMS, isNavItemActive } from "./nav-items";

describe("isNavItemActive", () => {
  it("matches the exact route and its children", () => {
    expect(isNavItemActive("/settings", "/settings")).toBe(true);
    expect(isNavItemActive("/settings/privacy", "/settings")).toBe(true);
  });

  it("matches related sections", () => {
    expect(isNavItemActive("/review/2026-10-05", "/week", ["/review"])).toBe(
      true,
    );
    expect(isNavItemActive("/reviewer", "/week", ["/review"])).toBe(false);
  });

  it("does not match lookalike prefixes", () => {
    expect(isNavItemActive("/settingsx", "/settings")).toBe(false);
    expect(isNavItemActive("/dashboard", "/settings")).toBe(false);
  });
});

describe("NAV_ITEMS", () => {
  // Guards the "no dead links" rule: every nav entry needs a real page in
  // the authenticated (app) route group.
  it.each(NAV_ITEMS.map((item) => [item.href]))("%s has a page", (href) => {
    const page = path.join(process.cwd(), "src/app/(app)", href, "page.tsx");
    expect(existsSync(page)).toBe(true);
  });
});
