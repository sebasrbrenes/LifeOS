"use client";

import { PencilIcon, Trash2Icon, XIcon } from "lucide-react";
import { startTransition, useActionState, useState } from "react";

import { FormMessage } from "@/components/forms/form-message";
import { Button } from "@/components/ui/button";
import { idleState, type ActionState } from "@/lib/action-state";

import { deleteMetricValue, updateMetricValue } from "../actions";
import { ValueForm, type ValueMetric } from "./value-form";

export type HistoryEntry = {
  id: string;
  date: string;
  dateLabel: string;
  valueLabel: string;
  valueInput: string;
  note: string | null;
  sourceLabel: string;
  editable: boolean;
};

function HistoryRow({
  entry,
  metricId,
  metric,
  today,
}: {
  entry: HistoryEntry;
  metricId: string;
  metric: ValueMetric;
  today: string;
}) {
  const [editing, setEditing] = useState(false);
  const [deleteState, deleteAction, deleting] = useActionState<ActionState>(
    () => deleteMetricValue(entry.id),
    idleState,
  );

  function confirmDelete() {
    if (
      window.confirm(
        `¿Eliminar el registro del ${entry.dateLabel} (${entry.valueLabel})?`,
      )
    ) {
      startTransition(() => deleteAction());
    }
  }

  return (
    <li className="grid gap-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="grid min-w-0 gap-0.5">
          <span className="font-mono text-base tabular-nums">
            {entry.valueLabel}
          </span>
          <span className="text-xs text-muted-foreground">
            {entry.dateLabel} · {entry.sourceLabel}
          </span>
          {entry.note ? (
            <span className="text-sm text-muted-foreground">{entry.note}</span>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-1">
          {entry.editable ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              className="size-11"
              aria-label={
                editing
                  ? "Cancelar edición"
                  : `Editar registro del ${entry.dateLabel}`
              }
              aria-expanded={editing}
              onClick={() => setEditing(!editing)}
            >
              {editing ? (
                <XIcon aria-hidden="true" />
              ) : (
                <PencilIcon aria-hidden="true" />
              )}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            className="size-11 text-muted-foreground hover:text-destructive"
            aria-label={`Eliminar registro del ${entry.dateLabel}`}
            disabled={deleting}
            onClick={confirmDelete}
          >
            <Trash2Icon aria-hidden="true" />
          </Button>
        </div>
      </div>
      {deleteState.status === "error" && deleteState.message ? (
        <FormMessage status="error">{deleteState.message}</FormMessage>
      ) : null}
      {editing ? (
        <div className="rounded-xl border bg-background/40 p-4">
          <ValueForm
            action={updateMetricValue.bind(null, metricId, entry.id)}
            metric={metric}
            today={today}
            idPrefix={`edit-${entry.id}`}
            defaults={{
              value: entry.valueInput,
              date: entry.date,
              note: entry.note ?? "",
            }}
            submitLabel="Guardar cambios"
            onDone={() => setEditing(false)}
          />
        </div>
      ) : null}
    </li>
  );
}

export function ValueHistory({
  entries,
  metricId,
  metric,
  today,
}: {
  entries: HistoryEntry[];
  metricId: string;
  metric: ValueMetric;
  today: string;
}) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aún no hay registros. Registra el primero arriba: la puntuación se
        calcula al instante.
      </p>
    );
  }
  return (
    <ol className="divide-y" aria-label="Historial de registros">
      {entries.map((entry) => (
        <HistoryRow
          key={entry.id}
          entry={entry}
          metricId={metricId}
          metric={metric}
          today={today}
        />
      ))}
    </ol>
  );
}
