"use client";

import { useState } from "react";

import { SelectField } from "@/components/forms/fields";
import { FormField } from "@/components/forms/form-field";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { useFormAction } from "@/components/forms/use-form-action";
import type { ActionState } from "@/lib/action-state";

export type CommitmentFormInitial = {
  title: string;
  categoryId: string;
  completionType: "quantity" | "boolean";
  targetValue: string;
  unit: string;
  weight: string;
};

const EMPTY: CommitmentFormInitial = {
  title: "",
  categoryId: "",
  completionType: "quantity",
  targetValue: "",
  unit: "",
  weight: "1",
};

/** Create or edit a weekly commitment. */
export function CommitmentForm({
  action,
  categories,
  initial = EMPTY,
  idPrefix,
  submitLabel,
  pendingLabel,
  resetOnSuccess = false,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  categories: { id: string; name: string }[];
  initial?: CommitmentFormInitial;
  idPrefix: string;
  submitLabel: string;
  pendingLabel: string;
  resetOnSuccess?: boolean;
}) {
  const { state, pending, formRef, onSubmit } = useFormAction(action, {
    resetOnSuccess,
  });
  const [type, setType] = useState(initial.completionType);
  const errors = state.fieldErrors ?? {};

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      onReset={() => setType(initial.completionType)}
      className="grid gap-4"
      noValidate
    >
      {state.message ? (
        <FormMessage status={state.status === "error" ? "error" : "success"}>
          {state.message}
        </FormMessage>
      ) : null}
      <FormField
        idPrefix={idPrefix}
        name="title"
        label="Compromiso"
        placeholder="p. ej. Salir a correr"
        defaultValue={initial.title}
        maxLength={200}
        error={errors.title}
        required
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          idPrefix={idPrefix}
          name="completionType"
          label="Tipo"
          value={type}
          onChange={(event) =>
            setType(
              event.currentTarget.value === "boolean" ? "boolean" : "quantity",
            )
          }
          error={errors.completionType}
        >
          <option value="quantity">Cantidad (p. ej. 3 veces)</option>
          <option value="boolean">Sí / No</option>
        </SelectField>
        <SelectField
          idPrefix={idPrefix}
          name="categoryId"
          label="Categoría"
          defaultValue={initial.categoryId}
          error={errors.categoryId}
        >
          <option value="">Sin categoría</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </SelectField>
      </div>
      {type === "quantity" ? (
        <div className="grid grid-cols-2 gap-4">
          <FormField
            idPrefix={idPrefix}
            name="targetValue"
            label="Objetivo"
            inputMode="decimal"
            placeholder="3"
            defaultValue={initial.targetValue}
            error={errors.targetValue}
            required
          />
          <FormField
            idPrefix={idPrefix}
            name="unit"
            label="Unidad (opcional)"
            placeholder="salidas, km…"
            defaultValue={initial.unit}
            maxLength={20}
            error={errors.unit}
          />
        </div>
      ) : null}
      <FormField
        idPrefix={idPrefix}
        name="weight"
        label="Peso"
        inputMode="decimal"
        defaultValue={initial.weight}
        error={errors.weight}
        hint="Relativo a los demás compromisos de la semana. 1 = normal, 2 = el doble de importante."
      />
      <SubmitButton
        pending={pending}
        pendingLabel={pendingLabel}
        className="sm:w-auto sm:justify-self-start sm:px-6"
      >
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
