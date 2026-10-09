"use client";

import { CopyIcon } from "lucide-react";
import { useState, useTransition } from "react";

import { FormMessage } from "@/components/forms/form-message";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/action-state";

import { copyCommitments } from "../actions";

/** Starts a week from the previous week's commitments, progress reset. */
export function CopyWeekButton({
  fromWeek,
  toWeek,
  count,
}: {
  fromWeek: string;
  toWeek: string;
  count: number;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionState | null>(null);
  return (
    <div className="grid gap-3">
      {result?.message ? (
        <FormMessage status={result.status === "error" ? "error" : "success"}>
          {result.message}
        </FormMessage>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="h-11 justify-self-start"
        disabled={pending}
        onClick={() =>
          startTransition(async () =>
            setResult(await copyCommitments(fromWeek, toWeek)),
          )
        }
      >
        <CopyIcon aria-hidden="true" />
        Copiar los {count} compromiso(s) de la semana anterior
      </Button>
    </div>
  );
}
