"use client";

import { useState } from "react";

import { SelectField } from "@/components/forms/fields";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { useFormAction } from "@/components/forms/use-form-action";
import { Label } from "@/components/ui/label";
import { CSV_MAX_BYTES } from "@/lib/integrations/csv";

import { importCsv } from "../actions";

/** Upload a CSV of dated values into one metric. */
export function CsvImportForm({
  metrics,
}: {
  metrics: { id: string; name: string; unit: string | null }[];
}) {
  const { state, pending, formRef, onSubmit } = useFormAction(importCsv, {
    resetOnSuccess: true,
  });
  const [sizeError, setSizeError] = useState<string | null>(null);
  const fileError = sizeError ?? state.fieldErrors?.file;

  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid gap-4" noValidate>
      {state.message ? (
        <FormMessage status={state.status === "error" ? "error" : "success"}>
          {state.message}
        </FormMessage>
      ) : null}
      <SelectField
        idPrefix="csv"
        name="metricId"
        label="Métrica"
        defaultValue=""
        error={state.fieldErrors?.metricId}
      >
        <option value="" disabled>
          Elige una métrica
        </option>
        {metrics.map((metric) => (
          <option key={metric.id} value={metric.id}>
            {metric.name}
            {metric.unit ? ` (${metric.unit})` : ""}
          </option>
        ))}
      </SelectField>
      <div className="grid gap-2">
        <Label htmlFor="csv-file">Archivo CSV</Label>
        <input
          id="csv-file"
          name="file"
          type="file"
          accept=".csv,text/csv,text/plain"
          aria-invalid={fileError ? true : undefined}
          aria-describedby={fileError ? "csv-file-error" : "csv-file-hint"}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            setSizeError(
              file && file.size > CSV_MAX_BYTES
                ? "El archivo es demasiado grande (máx. 900 KB)."
                : null,
            );
          }}
          className="text-sm file:mr-3 file:h-11 file:rounded-lg file:border file:border-input file:bg-input/30 file:px-4 file:text-sm file:text-foreground"
        />
        {fileError ? (
          <p id="csv-file-error" className="text-sm text-destructive">
            {fileError}
          </p>
        ) : (
          <p id="csv-file-hint" className="text-xs text-muted-foreground">
            Una fila por valor: <span className="font-mono">fecha;valor</span> y
            una nota opcional. Fechas 2026-10-01 o 01/10/2026; decimales con
            coma o punto. Si una fila está mal no se importa nada, y volver a
            subir el mismo archivo no duplica valores.
          </p>
        )}
      </div>
      <SubmitButton
        pending={pending}
        pendingLabel="Importando…"
        className="sm:w-auto sm:justify-self-start sm:px-6"
      >
        Importar valores
      </SubmitButton>
    </form>
  );
}
