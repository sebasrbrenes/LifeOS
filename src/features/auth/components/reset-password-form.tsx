"use client";

import { useActionState } from "react";

import { FormField } from "@/components/forms/form-field";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";

import { updatePassword } from "../actions";
import { initialAuthFormState } from "../form-state";
import { PASSWORD_MIN_LENGTH } from "../schemas";

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(
    updatePassword,
    initialAuthFormState,
  );

  return (
    <form action={formAction} className="grid gap-5" noValidate>
      {state.status === "error" && state.message ? (
        <FormMessage status="error">{state.message}</FormMessage>
      ) : null}

      <FormField
        name="password"
        label="Nueva contraseña"
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

      <SubmitButton pending={pending} pendingLabel="Guardando…">
        Guardar contraseña
      </SubmitButton>
    </form>
  );
}
