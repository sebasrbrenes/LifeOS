import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { SIGN_IN_PATH, safeNextPath } from "@/lib/auth/routes";
import { createClient } from "@/lib/supabase/server";

const EMAIL_OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

/**
 * Landing point for links in Supabase auth emails (sign-up confirmation,
 * password recovery). Supports both the default PKCE `code` link and the
 * `token_hash` form used by custom email templates.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();
  let error: { code?: string; status?: number } | null = null;

  if (tokenHash && type && EMAIL_OTP_TYPES.has(type)) {
    ({ error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    }));
  } else if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else {
    error = { code: "missing_params" };
  }

  if (error) {
    console.warn("[auth] confirm failed", {
      code: error.code ?? null,
      status: error.status ?? null,
    });
    return NextResponse.redirect(
      new URL(`${SIGN_IN_PATH}?error=link_invalid`, request.url),
    );
  }

  return NextResponse.redirect(new URL(next, request.url));
}
