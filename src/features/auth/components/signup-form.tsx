"use client";

import { useActionState, useSyncExternalStore } from "react";

import { FormField } from "@/components/forms/form-field";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";

import { signUp } from "../actions";
import { initialAuthFormState } from "../form-state";
import { PASSWORD_MIN_LENGTH } from "../schemas";

export function SignupForm() {
  const [state, formAction, pending] = useActionState(
    signUp,
    initialAuthFormState,
  );
  const timezone = useBrowserTimezone();

  if (state.status === "success" && state.message) {
    return <FormMessage status="success">{state.message}</FormMessage>;
  }

  return (
    <form action={formAction} className="grid gap-5" noValidate>
      {state.status === "error" && state.message ? (
        <FormMessage status="error">{state.message}</FormMessage>
      ) : null}

      <input type="hidden" name="timezone" value={timezone} />

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
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN_LENGTH}
        hint={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres.`}
        error={state.fieldErrors?.password}
      />
      <FormField
        name="confirmPassword"
        label="Repite la contraseña"
        type="password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.confirmPassword}
      />

      <SubmitButton pending={pending} pendingLabel="Creando cuenta…">
        Crear cuenta
      </SubmitButton>
    </form>
  );
}

const noSubscription = () => () => {};

/**
 * The browser's IANA timezone, or "" during server render and hydration
 * (the server can't know it). Controlled, so form resets don't clear it.
 */
function useBrowserTimezone() {
  return useSyncExternalStore(
    noSubscription,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
    () => "",
  );
}
