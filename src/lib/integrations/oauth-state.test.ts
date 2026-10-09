import { describe, expect, it } from "vitest";

import { createOAuthState, verifyOAuthState } from "./oauth-state";

const USER = "aaaaaaaa-0000-4000-8000-000000000001";

describe("OAuth state", () => {
  it("accepts the state it issued, for the same user", () => {
    const { state, cookieValue } = createOAuthState(USER);
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(
      verifyOAuthState({ cookieValue, returnedState: state, userId: USER }),
    ).toBe(true);
  });

  it("rejects forged, missing or another user's state", () => {
    const { state, cookieValue } = createOAuthState(USER);
    expect(
      verifyOAuthState({ cookieValue, returnedState: "forged", userId: USER }),
    ).toBe(false);
    expect(
      verifyOAuthState({
        cookieValue: undefined,
        returnedState: state,
        userId: USER,
      }),
    ).toBe(false);
    expect(
      verifyOAuthState({ cookieValue, returnedState: null, userId: USER }),
    ).toBe(false);
    expect(
      verifyOAuthState({
        cookieValue,
        returnedState: state,
        userId: "bbbbbbbb-0000-4000-8000-000000000002",
      }),
    ).toBe(false);
  });

  it("is unpredictable", () => {
    expect(createOAuthState(USER).state).not.toBe(createOAuthState(USER).state);
  });
});
