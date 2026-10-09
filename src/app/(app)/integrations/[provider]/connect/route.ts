import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import {
  isIntegrationProvider,
  providerClient,
} from "@/features/integrations/server/registry";
import { getSessionUser } from "@/lib/auth/session";
import {
  OAUTH_STATE_MAX_AGE_SECONDS,
  createOAuthState,
  oauthStateCookieName,
} from "@/lib/integrations/oauth-state";

/** Starts the OAuth flow: state cookie, then off to the provider. */
export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/integrations/[provider]/connect">,
) {
  const { provider } = await params;
  const back = new URL("/integrations", request.url);
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  if (!isIntegrationProvider(provider)) return NextResponse.redirect(back);
  const client = providerClient(provider);
  if (!client) {
    back.searchParams.set("error", "not_configured");
    return NextResponse.redirect(back);
  }

  const { state, cookieValue } = createOAuthState(user.id);
  (await cookies()).set(oauthStateCookieName(provider), cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/integrations/${provider}`,
    maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
  });
  return NextResponse.redirect(client.authorizeUrl(state));
}
