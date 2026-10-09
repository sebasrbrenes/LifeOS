"use client";

import { SelectField } from "@/components/forms/fields";
import { FormField } from "@/components/forms/form-field";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { useFormAction } from "@/components/forms/use-form-action";
import type { ActionState } from "@/lib/action-state";
import type { MetricDirection } from "@/lib/scoring";

export type ValueMetric = {
  direction: MetricDirection;
  unit: string | null;
  milestones: { value: number; label: string }[];
};

/** Register or edit one value. Supports backdating up to `today`. */
export function ValueForm({
  action,
  metric,
  today,
  idPrefix,
  defaults,
  submitLabel,
  onDone,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  metric: ValueMetric;
  today: string;
  idPrefix: string;
  defaults?: { value: string; date: string; note: string };
  submitLabel: string;
  onDone?: () => void;
}) {
  const { state, pending, formRef, onSubmit } = useFormAction(
    async (prev, formData) => {
      const next = await action(prev, formData);
      if (next.status === "success") onDone?.();
      return next;
    },
    { resetOnSuccess: !defaults },
  );
  const errors = state.fieldErrors ?? {};

  let valueField: React.ReactNode;
  if (metric.direction === "boolean") {
    valueField = (
      <SelectField
        name="value"
        label="Resultado"
        idPrefix={idPrefix}
        defaultValue={defaults?.value ?? "1"}
        error={errors.value}
      >
        <option value="1">Sí</option>
        <option value="0">No</option>
      </SelectField>
    );
  } else if (metric.direction === "milestone" && metric.milestones.length > 0) {
    valueField = (
      <SelectField
        name="value"
        label="Nivel alcanzado"
        idPrefix={idPrefix}
        defaultValue={defaults?.value ?? ""}
        error={errors.value}
      >
        <option value="" disabled>
          Elige un nivel
        </option>
        {metric.milestones.map((m) => (
          <option key={m.value} value={String(m.value)}>
            {m.label}
          </option>
        ))}
      </SelectField>
    );
  } else {
    const unit = metric.direction === "ratio" ? "%" : metric.unit;
    valueField = (
      <FormField
        name="value"
        label={unit ? `Valor (${unit})` : "Valor"}
        idPrefix={idPrefix}
        inputMode="decimal"
        autoComplete="off"
        defaultValue={defaults?.value}
        required
        error={errors.value}
      />
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid gap-4" noValidate>
      {state.status === "error" && state.message ? (
        <FormMessage status="error">{state.message}</FormMessage>
      ) : null}
      {state.status === "success" && state.message && !defaults ? (
        <FormMessage status="success">{state.message}</FormMessage>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {valueField}
        <FormField
          name="date"
          label="Fecha"
          type="date"
          idPrefix={idPrefix}
          max={today}
          defaultValue={defaults?.date ?? today}
          required
          hint={defaults ? undefined : "Puedes registrar días anteriores."}
          error={errors.date}
        />
      </div>
      <FormField
        name="note"
        label="Nota (opcional)"
        idPrefix={idPrefix}
        defaultValue={defaults?.note}
        maxLength={1000}
        error={errors.note}
      />
      <SubmitButton
        pending={pending}
        pendingLabel="Guardando…"
        className="sm:w-auto sm:justify-self-start sm:px-6"
      >
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
