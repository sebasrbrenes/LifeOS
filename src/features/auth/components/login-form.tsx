"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";

import { FormField } from "@/components/forms/form-field";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";

import { signIn } from "../actions";
import { initialAuthFormState } from "../form-state";

const LINK_ERRORS: Record<string, string> = {
  link_invalid:
    "El enlace no es válido o ha caducado. Inicia sesión o solicita uno nuevo.",
};

export function LoginForm() {
  const searchParams = useSearchParams();
  const [state, formAction, pending] = useActionState(
    signIn,
    initialAuthFormState,
  );

  const linkError = LINK_ERRORS[searchParams.get("error") ?? ""];
  const message = state.message ?? (state.status === "idle" ? linkError : null);

  return (
    <form action={formAction} className="grid gap-5" noValidate>
      {message ? <FormMessage status="error">{message}</FormMessage> : null}

      <input type="hidden" name="next" value={searchParams.get("next") ?? ""} />

      <FormField
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={state.email}
        error={state.fieldErrors?.email}
      />
      <FormField
        name="password"
        label="Contraseña"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
      />

      <div className="-mt-2 flex justify-end">
        <Link
          href="/forgot-password"
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          ¿Olvidaste tu contraseña?
        </Link>
      </div>

      <SubmitButton pending={pending} pendingLabel="Entrando…">
        Entrar
      </SubmitButton>
    </form>
  );
}
