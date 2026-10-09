import { describe, expect, it } from "vitest";

import { isAuthorizedCronRequest } from "./cron-auth";

const SECRET = "s".repeat(40);

describe("isAuthorizedCronRequest", () => {
  it("accepts only the exact bearer secret", () => {
    expect(isAuthorizedCronRequest(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(isAuthorizedCronRequest(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(isAuthorizedCronRequest(SECRET, SECRET)).toBe(false);
    expect(isAuthorizedCronRequest(null, SECRET)).toBe(false);
  });

  it("is closed when no secret is configured", () => {
    expect(isAuthorizedCronRequest("Bearer ", undefined)).toBe(false);
    expect(isAuthorizedCronRequest("Bearer undefined", undefined)).toBe(false);
  });
});
