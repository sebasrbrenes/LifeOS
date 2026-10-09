"use client";

import { useActionState } from "react";

import { FormField } from "@/components/forms/form-field";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";

import { requestPasswordReset } from "../actions";
import { initialAuthFormState } from "../form-state";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(
    requestPasswordReset,
    initialAuthFormState,
  );

  if (state.status === "success" && state.message) {
    return <FormMessage status="success">{state.message}</FormMessage>;
  }

  return (
    <form action={formAction} className="grid gap-5" noValidate>
      {state.status === "error" && state.message ? (
        <FormMessage status="error">{state.message}</FormMessage>
      ) : null}

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

      <SubmitButton pending={pending} pendingLabel="Enviando…">
        Enviar enlace
      </SubmitButton>
    </form>
  );
}
