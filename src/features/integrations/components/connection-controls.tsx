"use client";

import { RefreshCwIcon, Trash2Icon, UnplugIcon } from "lucide-react";
import { useState, useTransition } from "react";

import { FormMessage } from "@/components/forms/form-message";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/action-state";

import {
  deleteImportedData,
  disconnectProvider,
  syncNow,
} from "../integration-actions";

/** Sync / disconnect / delete imported data for a connected provider. */
export function ConnectionControls({
  provider,
  name,
  connected,
}: {
  provider: string;
  name: string;
  connected: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionState | null>(null);
  const run = (task: () => Promise<ActionState>) =>
    startTransition(async () => setResult(await task()));

  return (
    <div className="grid gap-3">
      {result?.message ? (
        <FormMessage status={result.status === "error" ? "error" : "success"}>
          {result.message}
        </FormMessage>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {connected ? (
          <>
            <Button
              type="button"
              size="lg"
              className="h-11"
              disabled={pending}
              onClick={() => run(() => syncNow(provider))}
            >
              <RefreshCwIcon aria-hidden="true" />
              Sincronizar ahora
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-11"
              disabled={pending}
              onClick={() => {
                if (
                  window.confirm(
                    `¿Desconectar ${name}? Life OS dejará de recibir datos y olvidará el acceso. Los valores ya importados se conservan.`,
                  )
                )
                  run(() => disconnectProvider(provider));
              }}
            >
              <UnplugIcon aria-hidden="true" />
              Desconectar
            </Button>
          </>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="lg"
          className="h-11 text-destructive"
          disabled={pending}
          onClick={() => {
            if (
              window.confirm(
                `¿Borrar todos los valores importados de ${name}? No se puede deshacer y tus scores se recalcularán sin ellos.`,
              )
            )
              run(() => deleteImportedData(provider));
          }}
        >
          <Trash2Icon aria-hidden="true" />
          Borrar datos importados
        </Button>
      </div>
    </div>
  );
}
