import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import {
  isIntegrationProvider,
  providerClient,
} from "@/features/integrations/server/registry";
import { syncProviderForUser } from "@/features/integrations/server/service";
import { saveConnection } from "@/features/integrations/server/store";
import { getSessionUser } from "@/lib/auth/session";
import {
  oauthStateCookieName,
  verifyOAuthState,
} from "@/lib/integrations/oauth-state";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * OAuth callback: verify state and session, exchange the code on the
 * server, store encrypted tokens, run the first sync. Tokens never reach
 * the browser; failures redirect with a code, never provider details.
 */
export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/integrations/[provider]/callback">,
) {
  const { provider } = await params;
  const back = new URL("/integrations", request.url);
  const fail = (code: string) => {
    back.searchParams.set("error", code);
    return NextResponse.redirect(back);
  };

  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  if (!isIntegrationProvider(provider)) return fail("unknown_provider");
  const client = providerClient(provider);
  if (!client) return fail("not_configured");

  const cookieStore = await cookies();
  const cookieName = oauthStateCookieName(provider);
  const cookieValue = cookieStore.get(cookieName)?.value;
  cookieStore.delete({ name: cookieName, path: `/integrations/${provider}` });

  const query = request.nextUrl.searchParams;
  if (
    !verifyOAuthState({
      cookieValue,
      returnedState: query.get("state"),
      userId: user.id,
    })
  )
    return fail("invalid_state");
  if (query.get("error") || !query.get("code")) return fail("denied");

  try {
    const tokens = await client.exchange(query);
    if (!client.canRead(tokens.scopes)) {
      await client.revoke(tokens).catch(() => undefined);
      return fail("missing_scope");
    }
    const admin = createAdminClient();
    await saveConnection(admin, user.id, provider, tokens);
    const sync = await syncProviderForUser(user.id, provider, admin);
    back.searchParams.set("connected", provider);
    if (!sync.ok) back.searchParams.set("error", "first_sync_failed");
    return NextResponse.redirect(back);
  } catch {
    console.error("[integrations] callback failed", { provider });
    return fail("exchange_failed");
  }
}
