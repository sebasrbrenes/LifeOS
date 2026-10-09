"use client";

import { useState } from "react";

import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { useFormAction } from "@/components/forms/use-form-action";
import { parseDecimal } from "@/lib/format";
import { cn } from "@/lib/utils";

import { saveCategorySettings } from "../actions";

type Row = { id: string; name: string; weight: string; enabled: boolean };

/** Category weights with a live total; saving requires exactly 100 %. */
export function CategoryWeightsForm({
  categories,
}: {
  categories: { id: string; name: string; weight: number; enabled: boolean }[];
}) {
  const { state, pending, formRef, onSubmit } =
    useFormAction(saveCategorySettings);
  const [rows, setRows] = useState<Row[]>(() =>
    categories.map((c) => ({ ...c, weight: String(c.weight) })),
  );
  const total =
    Math.round(
      rows
        .filter((row) => row.enabled)
        .reduce((sum, row) => sum + (parseDecimal(row.weight) ?? 0) * 10, 0),
    ) / 10;
  const balanced = Number.isFinite(total) && total === 100;
  const errors = state.fieldErrors ?? {};

  const update = (index: number, patch: Partial<Row>) =>
    setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid gap-4" noValidate>
      {state.message ? (
        <FormMessage status={state.status === "error" ? "error" : "success"}>
          {state.message}
        </FormMessage>
      ) : null}
      <ul className="grid gap-2">
        {rows.map((row, index) => (
          <li
            key={row.id}
            className="grid grid-cols-[auto_1fr_6.5rem] items-center gap-3"
          >
            <input
              type="hidden"
              name={`categories.${index}.id`}
              value={row.id}
            />
            <label className="flex size-11 items-center justify-center">
              <span className="sr-only">Activar {row.name}</span>
              <input
                type="checkbox"
                name={`categories.${index}.enabled`}
                checked={row.enabled}
                onChange={(event) =>
                  update(index, { enabled: event.currentTarget.checked })
                }
                className="size-5 accent-[var(--primary)]"
              />
            </label>
            <div className="grid gap-1">
              <label className="sr-only" htmlFor={`category-name-${row.id}`}>
                Nombre de la categoría {index + 1}
              </label>
              <input
                id={`category-name-${row.id}`}
                name={`categories.${index}.name`}
                value={row.name}
                maxLength={60}
                onChange={(event) =>
                  update(index, { name: event.currentTarget.value })
                }
                aria-invalid={
                  errors[`categories.${index}.name`] ? true : undefined
                }
                className={cn(
                  "h-11 w-full min-w-0 rounded-lg border border-input bg-input/30 px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm",
                  !row.enabled && "text-muted-foreground line-through",
                )}
              />
              {errors[`categories.${index}.name`] ? (
                <span className="text-xs text-destructive">
                  {errors[`categories.${index}.name`]}
                </span>
              ) : null}
            </div>
            <div className="grid gap-1">
              <div className="relative">
                <label
                  className="sr-only"
                  htmlFor={`category-weight-${row.id}`}
                >
                  Peso de {row.name} (%)
                </label>
                <input
                  id={`category-weight-${row.id}`}
                  name={`categories.${index}.weight`}
                  inputMode="decimal"
                  value={row.enabled ? row.weight : "0"}
                  disabled={!row.enabled}
                  onChange={(event) =>
                    update(index, { weight: event.currentTarget.value })
                  }
                  aria-invalid={
                    errors[`categories.${index}.weight`] ? true : undefined
                  }
                  className="h-11 w-full rounded-lg border border-input bg-input/30 pr-7 pl-3 text-right font-mono text-base tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 md:text-sm"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground"
                >
                  %
                </span>
              </div>
              {errors[`categories.${index}.weight`] ? (
                <span className="text-xs text-destructive">
                  {errors[`categories.${index}.weight`]}
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <div
        role="status"
        className={cn(
          "flex items-center justify-between rounded-lg border px-4 py-3 text-sm",
          balanced
            ? "border-primary/30 bg-primary/5"
            : "border-amber-300/40 bg-amber-300/5",
        )}
      >
        <span>Total de categorías activas</span>
        <span className="font-mono tabular-nums">
          {Number.isFinite(total) ? total : "—"} %{" "}
          {balanced
            ? "✓"
            : total > 100
              ? `· sobran ${Math.round((total - 100) * 10) / 10} %`
              : `· faltan ${Math.round((100 - total) * 10) / 10} %`}
        </span>
      </div>
      <SubmitButton
        pending={pending}
        pendingLabel="Guardando…"
        className="sm:w-auto sm:justify-self-start sm:px-6"
      >
        Guardar pesos
      </SubmitButton>
      <p className="text-xs text-muted-foreground">
        Cambiar pesos crea una nueva versión de scoring. El historial conserva
        la versión con la que se calculó.
      </p>
    </form>
  );
}
