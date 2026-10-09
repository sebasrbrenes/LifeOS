"use client";

import {
  BanIcon,
  CheckIcon,
  MinusIcon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";

import { FormMessage } from "@/components/forms/form-message";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/action-state";
import { formatNumber, formatShare, parseDecimal } from "@/lib/format";
import type { CommitmentScore } from "@/lib/scoring";
import { cn } from "@/lib/utils";

import {
  deleteCommitment,
  setCommitmentCancelled,
  setCommitmentProgress,
  updateCommitment,
} from "../actions";
import { CommitmentForm } from "./commitment-form";

export type CommitmentItemData = CommitmentScore & {
  categoryName: string | null;
};

function ProgressBar({ completion }: { completion: number }) {
  return (
    <div
      aria-hidden="true"
      className="h-1.5 overflow-hidden rounded-full bg-muted"
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width]",
          completion >= 1 ? "bg-primary" : "bg-primary/60",
        )}
        style={{ width: `${Math.min(completion, 1) * 100}%` }}
      />
    </div>
  );
}

/**
 * One commitment: progress, its share of the Week Score and, when the
 * week allows it, controls to log progress and re-plan.
 */
export function CommitmentItem({
  commitment,
  categories,
  canTrack,
  canPlan,
}: {
  commitment: CommitmentItemData;
  categories: { id: string; name: string }[];
  canTrack: boolean;
  canPlan: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [actual, setOptimisticActual] = useOptimistic(commitment.actualValue);
  const [message, setMessage] = useState<ActionState | null>(null);
  const cancelled = commitment.status === "cancelled";
  const isBoolean = commitment.completionType === "boolean";
  const completion = isBoolean
    ? actual >= 1
      ? 1
      : 0
    : Math.min(actual / commitment.targetValue, 1);
  const done = completion >= 1;
  const unit = commitment.unit ? ` ${commitment.unit}` : "";

  function run(task: () => Promise<ActionState>) {
    setMessage(null);
    startTransition(async () => {
      const result = await task();
      if (result.status === "error" || result.message) setMessage(result);
    });
  }

  function setProgress(value: number) {
    run(async () => {
      setOptimisticActual(value);
      return setCommitmentProgress(commitment.id, value);
    });
  }

  return (
    <li
      className={cn(
        "grid gap-3 rounded-xl border p-4",
        done && !cancelled && "border-primary/30 bg-primary/5",
        cancelled && "opacity-70",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="grid min-w-0 gap-0.5">
          <p
            className={cn(
              "font-medium break-words",
              cancelled && "line-through",
            )}
          >
            {commitment.title}
          </p>
          <p className="text-xs text-muted-foreground">
            {commitment.categoryName ?? "Sin categoría"}
            {cancelled ? " · Cancelado: no cuenta" : null}
          </p>
        </div>
        <p className="shrink-0 text-right font-mono text-sm tabular-nums">
          {isBoolean
            ? done
              ? "Hecho"
              : "Pendiente"
            : `${formatNumber(actual)} / ${formatNumber(commitment.targetValue)}${unit}`}
        </p>
      </div>

      {!cancelled ? (
        <>
          <ProgressBar completion={completion} />
          <p className="text-xs text-muted-foreground">
            {formatShare(completion)} completado · aporta{" "}
            <span className="font-mono text-foreground tabular-nums">
              {formatNumber(completion * commitment.weightShare * 100, 1)}
            </span>{" "}
            de {formatNumber(commitment.weightShare * 100, 1)} pts posibles
          </p>
        </>
      ) : null}

      {message?.message ? (
        <FormMessage status={message.status === "error" ? "error" : "success"}>
          {message.message}
        </FormMessage>
      ) : null}

      {canTrack && !cancelled ? (
        isBoolean ? (
          <Button
            type="button"
            variant={done ? "secondary" : "default"}
            size="lg"
            className="h-11 justify-self-start"
            aria-pressed={done}
            disabled={pending}
            onClick={() => setProgress(done ? 0 : 1)}
          >
            {done ? (
              <>
                <RotateCcwIcon aria-hidden="true" /> Marcar como pendiente
              </>
            ) : (
              <>
                <CheckIcon aria-hidden="true" /> Marcar como hecho
              </>
            )}
          </Button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              className="size-11"
              aria-label={`Restar uno a «${commitment.title}»`}
              disabled={pending || actual <= 0}
              onClick={() => setProgress(Math.max(0, actual - 1))}
            >
              <MinusIcon aria-hidden="true" />
            </Button>
            <Button
              type="button"
              size="icon-lg"
              className="size-11"
              aria-label={`Sumar uno a «${commitment.title}»`}
              disabled={pending}
              onClick={() => setProgress(actual + 1)}
            >
              <PlusIcon aria-hidden="true" />
            </Button>
            <ExactProgress
              id={commitment.id}
              title={commitment.title}
              current={actual}
              disabled={pending}
              onSave={setProgress}
            />
          </div>
        )
      ) : null}

      {canPlan ? (
        <details className="group">
          <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
            Editar o cancelar
          </summary>
          <div className="mt-4 grid gap-4">
            <CommitmentForm
              action={updateCommitment.bind(null, commitment.id)}
              categories={categories}
              idPrefix={`edit-${commitment.id}`}
              initial={{
                title: commitment.title,
                categoryId: commitment.categoryId ?? "",
                completionType: commitment.completionType,
                targetValue: String(commitment.targetValue),
                unit: commitment.unit ?? "",
                weight: String(commitment.weight),
              }}
              submitLabel="Guardar cambios"
              pendingLabel="Guardando…"
            />
            <div className="flex flex-wrap gap-3 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                size="lg"
                disabled={pending}
                onClick={() =>
                  run(() => setCommitmentCancelled(commitment.id, !cancelled))
                }
              >
                {cancelled ? (
                  <RotateCcwIcon aria-hidden="true" />
                ) : (
                  <BanIcon aria-hidden="true" />
                )}
                {cancelled ? "Reactivar" : "Cancelar compromiso"}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="lg"
                disabled={pending}
                onClick={() => {
                  if (
                    window.confirm(
                      `¿Eliminar «${commitment.title}»? Si ya no aplica, cancelarlo lo deja en el historial.`,
                    )
                  )
                    run(() => deleteCommitment(commitment.id));
                }}
              >
                <Trash2Icon aria-hidden="true" />
                Eliminar
              </Button>
            </div>
          </div>
        </details>
      ) : null}
    </li>
  );
}

/** Type an exact amount (e.g. 12,5 km) instead of tapping +/−. */
function ExactProgress({
  id,
  title,
  current,
  disabled,
  onSave,
}: {
  id: string;
  title: string;
  current: number;
  disabled: boolean;
  onSave: (value: number) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const inputId = `progress-${id}`;
  return (
    <form
      className="flex items-center gap-2"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const value = parseDecimal(
          new FormData(event.currentTarget).get("progress"),
        );
        if (value === null || !Number.isFinite(value) || value < 0) {
          setError("Introduce un número mayor o igual que 0.");
          return;
        }
        setError(null);
        onSave(value);
      }}
    >
      <label htmlFor={inputId} className="sr-only">
        Progreso exacto de «{title}»
      </label>
      <input
        id={inputId}
        name="progress"
        inputMode="decimal"
        key={current}
        defaultValue={String(current).replace(".", ",")}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : undefined}
        className="h-11 w-20 rounded-lg border border-input bg-input/30 px-3 text-right font-mono text-base tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
      />
      <Button
        type="submit"
        variant="outline"
        size="lg"
        className="h-11"
        disabled={disabled}
      >
        Fijar
      </Button>
      {error ? (
        <p id={`${inputId}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}
