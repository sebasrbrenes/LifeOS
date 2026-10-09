"use server";

import { redirect } from "next/navigation";

import {
  DEFAULT_AUTHENTICATED_PATH,
  SIGN_IN_PATH,
  safeNextPath,
} from "@/lib/auth/routes";
import { getSessionUser } from "@/lib/auth/session";
import { getPublicEnv } from "@/lib/env/public";
import { createClient } from "@/lib/supabase/server";

import { authErrorMessage, type AuthOperation } from "./errors";
import type { AuthFormState } from "./form-state";
import {
  forgotPasswordSchema,
  parseFormData,
  signInSchema,
  signUpSchema,
  updatePasswordSchema,
} from "./schemas";

function confirmUrl(next: string) {
  const url = new URL("/auth/confirm", getPublicEnv().NEXT_PUBLIC_APP_URL);
  url.searchParams.set("next", next);
  return url.toString();
}

function failure(
  error: { code?: string; status?: number },
  operation: AuthOperation,
  email?: string,
): AuthFormState {
  // Log the code only: never emails, passwords or tokens.
  console.warn(`[auth] ${operation} failed`, {
    code: error.code ?? null,
    status: error.status ?? null,
  });
  return {
    status: "error",
    message: authErrorMessage(error, operation),
    email,
  };
}

export async function signIn(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = parseFormData(signInSchema, formData);
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: parsed.fieldErrors,
      email: String(formData.get("email") ?? ""),
    };
  }

  const { email, password, next } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return failure(error, "sign-in", email);
  }

  redirect(safeNextPath(next));
}

export async function signUp(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = parseFormData(signUpSchema, formData);
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: parsed.fieldErrors,
      email: String(formData.get("email") ?? ""),
    };
  }

  const { email, password, timezone } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: confirmUrl(DEFAULT_AUTHENTICATED_PATH),
      // Read by the on_auth_user_created trigger to seed the profile.
      data: timezone ? { timezone } : undefined,
    },
  });
  if (error) {
    return failure(error, "sign-up", email);
  }

  // Projects with email confirmation disabled return a session immediately.
  if (data.session) {
    redirect(DEFAULT_AUTHENTICATED_PATH);
  }

  return {
    status: "success",
    message: `Te enviamos un enlace de confirmación a ${email}. Ábrelo para activar tu cuenta.`,
    email,
  };
}

export async function requestPasswordReset(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = parseFormData(forgotPasswordSchema, formData);
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: parsed.fieldErrors,
      email: String(formData.get("email") ?? ""),
    };
  }

  const { email } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: confirmUrl("/reset-password"),
  });
  // Only surface failures that don't reveal whether the account exists.
  if (error && (error.status === 429 || error.status === 0)) {
    return failure(error, "forgot-password", email);
  }
  if (error) {
    console.warn("[auth] forgot-password failed", {
      code: error.code ?? null,
      status: error.status ?? null,
    });
  }

  return {
    status: "success",
    message:
      "Si existe una cuenta con ese email, recibirás un enlace para restablecer la contraseña.",
    email,
  };
}

export async function updatePassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  // Re-verify the session inside the action; never trust the page that
  // rendered the form.
  const user = await getSessionUser();
  if (!user) {
    redirect(`${SIGN_IN_PATH}?next=/reset-password`);
  }

  const parsed = parseFormData(updatePasswordSchema, formData);
  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    return failure(error, "update-password");
  }

  redirect(DEFAULT_AUTHENTICATED_PATH);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    // The local session cookie is cleared regardless; log and continue.
    console.warn("[auth] sign-out failed", {
      code: error.code ?? null,
      status: error.status ?? null,
    });
  }
  redirect(SIGN_IN_PATH);
}
