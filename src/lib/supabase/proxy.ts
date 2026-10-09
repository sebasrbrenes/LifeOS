import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { resolveAuthRedirect } from "@/lib/auth/routes";
import { getPublicEnv } from "@/lib/env/public";

import type { Database } from "./database.types";

/**
 * Refreshes the Supabase session cookie and applies the optimistic route
 * rules. Runs in `src/proxy.ts` before every matched request.
 */
export async function updateSession(request: NextRequest) {
  const env = getPublicEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          // Prevents CDNs from caching a response that carries a session.
          for (const [key, value] of Object.entries(headers)) {
            response.headers.set(key, value);
          }
        },
      },
    },
  );

  // Do not run code between client creation and getClaims(): it validates
  // (and if needed refreshes) the session that setAll writes back.
  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(data?.claims?.sub);

  const destination = resolveAuthRedirect(
    request.nextUrl.pathname,
    request.nextUrl.search,
    isAuthenticated,
  );
  if (!destination) {
    return response;
  }

  const redirect = NextResponse.redirect(new URL(destination, request.url));
  // Carry refreshed session cookies and no-cache headers over to the redirect.
  for (const cookie of response.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  for (const key of ["cache-control", "expires", "pragma"]) {
    const value = response.headers.get(key);
    if (value) redirect.headers.set(key, value);
  }
  return redirect;
}
