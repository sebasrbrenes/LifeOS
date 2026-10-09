"use client";

import { useState } from "react";

import { SelectField } from "@/components/forms/fields";
import { FormField } from "@/components/forms/form-field";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { useFormAction } from "@/components/forms/use-form-action";
import type { ActionState } from "@/lib/action-state";
import { SOURCE_METRICS } from "@/lib/integrations/source-metrics";

const PROVIDER_LABELS = {
  strava: "Strava",
  google_calendar: "Google Calendar",
} as const;

/** Where a metric's values come from: manual, or a provider metric. */
export function SourceForm({
  action,
  initial,
  connected,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  initial: {
    sourceMetric: string;
    sportTypes: string;
    calendarIds: string;
    titleContains: string;
  };
  /** Providers the user has connected, to warn when one isn't. */
  connected: readonly string[];
}) {
  const { state, pending, formRef, onSubmit } = useFormAction(action);
  const [selected, setSelected] = useState(initial.sourceMetric || "manual");
  const provider = SOURCE_METRICS.find((m) => m.key === selected)?.provider;
  const errors = state.fieldErrors ?? {};

  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid gap-4" noValidate>
      {state.message ? (
        <FormMessage status={state.status === "error" ? "error" : "success"}>
          {state.message}
        </FormMessage>
      ) : null}
      <SelectField
        idPrefix="source"
        name="sourceMetric"
        label="Origen"
        value={selected}
        onChange={(event) => setSelected(event.currentTarget.value)}
        error={errors.sourceMetric}
      >
        <option value="manual">Registro manual</option>
        {(["strava", "google_calendar"] as const).map((group) => (
          <optgroup key={group} label={PROVIDER_LABELS[group]}>
            {SOURCE_METRICS.filter((m) => m.provider === group).map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
                {m.unit ? ` (${m.unit})` : ""}
              </option>
            ))}
          </optgroup>
        ))}
      </SelectField>

      {provider === "strava" ? (
        <FormField
          idPrefix="source"
          name="sportTypes"
          label="Solo estos deportes (opcional)"
          placeholder="Run, TrailRun"
          defaultValue={initial.sportTypes}
          error={errors.sourceFilter}
          hint="Tipos de Strava separados por comas. Vacío = todos los que aplican."
        />
      ) : null}
      {provider === "google_calendar" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            idPrefix="source"
            name="titleContains"
            label="El título contiene (opcional)"
            placeholder="QA"
            defaultValue={initial.titleContains}
            error={errors.sourceFilter}
          />
          <FormField
            idPrefix="source"
            name="calendarIds"
            label="Calendarios (opcional)"
            placeholder="primary"
            defaultValue={initial.calendarIds}
            hint="Ids separados por comas. Vacío = tu calendario principal."
          />
        </div>
      ) : null}

      {provider && !connected.includes(provider) ? (
        <p className="text-xs text-amber-200">
          {PROVIDER_LABELS[provider]} no está conectado: conéctalo en
          Integraciones para recibir datos.
        </p>
      ) : null}
      {provider ? (
        <p className="text-xs text-muted-foreground">
          Los valores importados se suman a los que registres a mano: no
          registres lo mismo dos veces.
          {provider === "google_calendar"
            ? " Un evento cuenta como tiempo planificado, no como hecho."
            : ""}
        </p>
      ) : null}

      <SubmitButton
        pending={pending}
        pendingLabel="Guardando…"
        className="sm:w-auto sm:justify-self-start sm:px-6"
      >
        Guardar origen
      </SubmitButton>
    </form>
  );
}
