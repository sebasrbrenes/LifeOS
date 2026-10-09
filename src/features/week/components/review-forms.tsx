"use client";

import { TextareaField } from "@/components/forms/fields";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { useFormAction } from "@/components/forms/use-form-action";

import { closeWeek, updateReviewNotes } from "../actions";

const NOTES_HINT =
  "Qué funcionó, qué no y qué cambiarás. Solo tú puedes verlo.";

/** Notes plus the irreversible "close week" step. */
export function CloseWeekForm({ weekStart }: { weekStart: string }) {
  const { state, pending, formRef, onSubmit } = useFormAction(
    closeWeek.bind(null, weekStart),
  );
  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid gap-4" noValidate>
      {state.message ? (
        <FormMessage status="error">{state.message}</FormMessage>
      ) : null}
      <TextareaField
        idPrefix="close"
        name="notes"
        label="Notas de la semana (opcional)"
        rows={4}
        maxLength={10_000}
        hint={NOTES_HINT}
        error={state.fieldErrors?.notes}
      />
      <SubmitButton
        pending={pending}
        pendingLabel="Cerrando…"
        className="sm:w-auto sm:justify-self-start sm:px-6"
      >
        Cerrar semana y guardar revisión
      </SubmitButton>
      <p className="text-xs text-muted-foreground">
        Al cerrarla, los compromisos y los scores de esta semana quedan
        guardados tal cual y ya no se pueden cambiar. Las notas sí.
      </p>
    </form>
  );
}

export function ReviewNotesForm({
  weekStart,
  notes,
}: {
  weekStart: string;
  notes: string | null;
}) {
  const { state, pending, formRef, onSubmit } = useFormAction(
    updateReviewNotes.bind(null, weekStart),
  );
  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid gap-4" noValidate>
      {state.message ? (
        <FormMessage status={state.status === "error" ? "error" : "success"}>
          {state.message}
        </FormMessage>
      ) : null}
      <TextareaField
        idPrefix="review"
        name="notes"
        label="Notas"
        rows={4}
        maxLength={10_000}
        defaultValue={notes ?? ""}
        hint={NOTES_HINT}
        error={state.fieldErrors?.notes}
      />
      <SubmitButton
        pending={pending}
        pendingLabel="Guardando…"
        className="sm:w-auto sm:justify-self-start sm:px-6"
      >
        Guardar notas
      </SubmitButton>
    </form>
  );
}
