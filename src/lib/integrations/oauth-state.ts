import { randomBytes, timingSafeEqual } from "node:crypto";

/**
 * OAuth `state` (CSRF protection): a random value sent to the provider
 * and kept in an httpOnly cookie bound to the user who started the flow.
 * The callback accepts the code only if the returned state matches the
 * cookie and the same user is signed in.
 */

export const OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;

export function oauthStateCookieName(provider: string): string {
  return `lifeos_oauth_${provider}`;
}

export function createOAuthState(userId: string): {
  state: string;
  cookieValue: string;
} {
  const state = randomBytes(32).toString("base64url");
  return { state, cookieValue: `${state}.${userId}` };
}

function equal(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyOAuthState({
  cookieValue,
  returnedState,
  userId,
}: {
  cookieValue: string | undefined;
  returnedState: string | null;
  userId: string;
}): boolean {
  if (!cookieValue || !returnedState) return false;
  const separator = cookieValue.lastIndexOf(".");
  if (separator <= 0) return false;
  const state = cookieValue.slice(0, separator);
  const boundUser = cookieValue.slice(separator + 1);
  return equal(state, returnedState) && equal(boundUser, userId);
}
