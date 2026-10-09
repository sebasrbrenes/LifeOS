"use client";

import { PowerIcon, PowerOffIcon, Trash2Icon } from "lucide-react";
import { startTransition, useActionState } from "react";

import { FormMessage } from "@/components/forms/form-message";
import { Button } from "@/components/ui/button";
import { idleState, type ActionState } from "@/lib/action-state";

import { deleteMetric, setMetricEnabled } from "../actions";

/** Enable/disable and delete, with confirmation for destructive steps. */
export function MetricControls({
  metricId,
  name,
  enabled,
  hasHistory,
}: {
  metricId: string;
  name: string;
  enabled: boolean;
  hasHistory: boolean;
}) {
  const [toggleState, toggle, toggling] = useActionState<ActionState>(
    () => setMetricEnabled(metricId, !enabled),
    idleState,
  );
  const [deleteState, remove, deleting] = useActionState<ActionState>(
    () => deleteMetric(metricId),
    idleState,
  );
  const state = deleteState.status === "error" ? deleteState : toggleState;

  return (
    <div className="grid gap-3">
      {state.message ? (
        <FormMessage status={state.status === "error" ? "error" : "success"}>
          {state.message}
        </FormMessage>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={toggling}
          onClick={() => startTransition(() => toggle())}
        >
          {enabled ? (
            <PowerOffIcon aria-hidden="true" />
          ) : (
            <PowerIcon aria-hidden="true" />
          )}
          {enabled ? "Desactivar" : "Activar"}
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="lg"
          disabled={deleting || hasHistory}
          onClick={() => {
            if (
              window.confirm(
                `¿Eliminar la métrica «${name}»? Esta acción no se puede deshacer.`,
              )
            ) {
              startTransition(() => remove());
            }
          }}
        >
          <Trash2Icon aria-hidden="true" />
          Eliminar métrica
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {hasHistory
          ? "Tiene registros: el historial no se borra al cambiar el scoring. Desactívala para que deje de contar, o elimina antes sus registros."
          : "Desactivar la quita del Life Score sin borrar nada."}
      </p>
    </div>
  );
}
