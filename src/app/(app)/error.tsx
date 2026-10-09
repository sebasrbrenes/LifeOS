"use client";

import { RotateCwIcon } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

const subscribe = (onChange: () => void) => {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
};

/**
 * Error boundary for the app: a failed load or save (most often a lost
 * connection) shows a way to retry instead of a blank screen. Never shows
 * error details, which can contain internal information.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  useEffect(() => {
    console.error("[app] render failed", { digest: error.digest ?? null });
  }, [error]);

  return (
    <div className="grid max-w-md gap-4 rounded-2xl border bg-card p-6">
      <h1 className="text-lg font-semibold">
        {online ? "Algo no ha ido bien" : "Sin conexión"}
      </h1>
      <p className="text-sm text-muted-foreground">
        {online
          ? "No se pudo cargar o guardar. Tus datos guardados están a salvo; vuelve a intentarlo."
          : "Life OS necesita conexión para cargar y guardar. Vuelve a intentarlo cuando tengas red."}
      </p>
      <Button
        type="button"
        size="lg"
        className="h-11 justify-self-start px-6"
        onClick={() => reset()}
      >
        <RotateCwIcon aria-hidden="true" />
        Reintentar
      </Button>
    </div>
  );
}
