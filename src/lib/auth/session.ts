import "server-only";

import { io } from "next/cache";
import { redirect } from "next/navigation";
import { cache } from "react";

import { SIGN_IN_PATH } from "@/lib/auth/routes";
import { createClient } from "@/lib/supabase/server";

/** The narrow view of the signed-in user that the app is allowed to use. */
export type SessionUser = {
  id: string;
  email: string | null;
};

/**
 * Data access layer entry point for identity. Verifies the JWT (not just
 * reads the cookie) and is deduplicated per request.
 *
 * Call this close to every data read and in every Server Action; the proxy
 * redirect is only an optimistic UX check.
 *
 * `io()` marks what follows as per-request work: token validation reads the
 * clock, and so does everything scored from the session afterwards
 * (Cache Components must not capture those values in a static shell).
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  await io();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) {
    return null;
  }
  return {
    id: data.claims.sub,
    email: typeof data.claims.email === "string" ? data.claims.email : null,
  };
});

/** Like {@link getSessionUser} but redirects to sign-in when signed out. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect(SIGN_IN_PATH);
  }
  return user;
}
