/**
 * Route access rules shared by the proxy and the auth actions.
 *
 * Pure functions only — no Next.js or Supabase imports — so the rules are
 * unit-testable and identical everywhere they are applied.
 */

export const DEFAULT_AUTHENTICATED_PATH = "/dashboard";
export const SIGN_IN_PATH = "/login";

/** Pages for signed-out users; signed-in users are bounced to the app. */
const GUEST_ONLY_PATHS = ["/login", "/signup", "/forgot-password"] as const;

/** Reachable regardless of session state (auth callbacks). */
const PUBLIC_PREFIXES = ["/auth/", "/api/cron/"] as const;

/** Static pages with no user data (the service worker's offline page). */
const PUBLIC_PATHS = ["/offline"] as const;

export type RouteAccess = "guest-only" | "public" | "protected";

export function classifyRoute(pathname: string): RouteAccess {
  if (
    GUEST_ONLY_PATHS.some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    )
  ) {
    return "guest-only";
  }
  if (
    PUBLIC_PATHS.some((path) => pathname === path) ||
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  ) {
    return "public";
  }
  return "protected";
}

/**
 * Returns a same-origin path to continue to after authentication, or the
 * default path when `candidate` is missing or could leave the app
 * (open-redirect protection).
 */
export function safeNextPath(candidate: string | null | undefined): string {
  if (!candidate || !candidate.startsWith("/")) {
    return DEFAULT_AUTHENTICATED_PATH;
  }
  // "//evil.com" and "/\evil.com" are treated as protocol-relative URLs by
  // browsers. Control characters can smuggle the same through URL parsers.
  if (
    candidate.startsWith("//") ||
    candidate.startsWith("/\\") ||
    /[\u0000-\u001F\u007F]/.test(candidate)
  ) {
    return DEFAULT_AUTHENTICATED_PATH;
  }
  try {
    const base = "http://life-os.invalid";
    const url = new URL(candidate, base);
    if (url.origin !== base) {
      return DEFAULT_AUTHENTICATED_PATH;
    }
    // Never send a freshly authenticated user back to a guest-only page.
    if (classifyRoute(url.pathname) === "guest-only") {
      return DEFAULT_AUTHENTICATED_PATH;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_AUTHENTICATED_PATH;
  }
}

/**
 * Decides where the proxy should send a request, or `null` to let it
 * through. This is an optimistic UX check only: every page and action still
 * verifies the session itself through the data access layer.
 */
export function resolveAuthRedirect(
  pathname: string,
  search: string,
  isAuthenticated: boolean,
): string | null {
  const access = classifyRoute(pathname);

  if (access === "protected" && !isAuthenticated) {
    const next = safeNextPath(`${pathname}${search}`);
    return `${SIGN_IN_PATH}?next=${encodeURIComponent(next)}`;
  }

  if (access === "guest-only" && isAuthenticated) {
    const next = new URLSearchParams(search).get("next");
    return safeNextPath(next);
  }

  return null;
}
