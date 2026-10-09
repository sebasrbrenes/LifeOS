"use client";

import { SelectField } from "@/components/forms/fields";
import { FormField } from "@/components/forms/form-field";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { useFormAction } from "@/components/forms/use-form-action";

import { saveMainGoal } from "../actions";

export function MainGoalForm({
  goal,
  categories,
}: {
  goal: {
    title: string;
    category_id: string | null;
    target_date: string | null;
  } | null;
  categories: { id: string; name: string }[];
}) {
  const { state, pending, formRef, onSubmit } = useFormAction(saveMainGoal);
  const errors = state.fieldErrors ?? {};
  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid gap-4" noValidate>
      {state.message ? (
        <FormMessage status={state.status === "error" ? "error" : "success"}>
          {state.message}
        </FormMessage>
      ) : null}
      <FormField
        name="title"
        label="Objetivo"
        idPrefix="goal"
        defaultValue={goal?.title ?? ""}
        placeholder="Conseguir mi próximo rol de QA"
        maxLength={200}
        required
        error={errors.title}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          name="categoryId"
          label="Categoría"
          idPrefix="goal"
          defaultValue={goal?.category_id ?? ""}
          error={errors.categoryId}
        >
          <option value="">Sin categoría</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
        <FormField
          name="targetDate"
          label="Fecha objetivo (opcional)"
          idPrefix="goal"
          type="date"
          defaultValue={goal?.target_date ?? ""}
          error={errors.targetDate}
        />
      </div>
      <SubmitButton
        pending={pending}
        pendingLabel="Guardando…"
        className="sm:w-auto sm:justify-self-start sm:px-6"
      >
        Guardar objetivo
      </SubmitButton>
    </form>
  );
}
