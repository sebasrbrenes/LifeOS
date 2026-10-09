import { LinkIcon, PlugIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";

import type { ProviderAvailability } from "@/lib/env/server-schema";
import { cn } from "@/lib/utils";

import type { PROVIDERS } from "../providers";
import { ConnectionControls } from "./connection-controls";

type Connection = {
  status: string;
  scopes: unknown;
  last_synced_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
};

function statusOf(
  availability: ProviderAvailability,
  connection: Connection | null,
): { label: string; tone: "ok" | "warn" | "muted" | "error" } {
  if (availability.state === "unavailable")
    return availability.reason === "provider_closed"
      ? { label: "No disponible", tone: "muted" }
      : { label: "Próximamente", tone: "muted" };
  if (connection?.status === "connected")
    return { label: "Conectado", tone: "ok" };
  if (connection?.status === "error") return { label: "Error", tone: "error" };
  if (availability.state === "not_configured")
    return { label: "Sin configurar", tone: "warn" };
  return { label: "No conectado", tone: "muted" };
}

const TONES = {
  ok: "border-primary/30 bg-primary/10 text-primary",
  warn: "border-amber-300/40 bg-amber-300/10 text-amber-200",
  muted: "border-border text-muted-foreground",
  error: "border-destructive/40 bg-destructive/10 text-destructive",
};

/** One provider: what it imports and its real state — never a dead button. */
function formatInstant(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("es", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

export function ProviderCard({
  provider,
  availability,
  connection,
  timeZone,
}: {
  provider: (typeof PROVIDERS)[number];
  availability: ProviderAvailability;
  connection: Connection | null;
  timeZone: string;
}) {
  const status = statusOf(availability, connection);
  const linked = connection !== null && connection.status !== "disconnected";
  return (
    <article className="grid gap-3 rounded-2xl border bg-card p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <PlugIcon
            aria-hidden="true"
            className="size-4 text-muted-foreground"
          />
          <h2 className="font-semibold">{provider.name}</h2>
        </div>
        <span
          className={cn(
            "rounded-full border px-2.5 py-0.5 text-xs",
            TONES[status.tone],
          )}
        >
          {status.label}
        </span>
      </header>
      <p className="text-sm">{provider.description}</p>
      <p className="text-xs text-muted-foreground">{provider.imports}</p>
      {availability.state === "unavailable" ? (
        <p className="text-xs text-muted-foreground">
          {availability.reason === "provider_closed"
            ? "Google no admite proyectos nuevos en la API de Google Health todavía. Life OS funciona sin ella y la activará cuando haya acceso."
            : "Integración opcional prevista para más adelante."}
        </p>
      ) : availability.state === "not_configured" ? (
        <p className="text-xs text-muted-foreground">
          Para conectarla, el servidor necesita:{" "}
          <span className="font-mono">{availability.missing.join(", ")}</span>.
          Ver docs/SETUP.md.
        </p>
      ) : null}
      {linked && connection ? (
        <dl className="grid gap-1 text-xs text-muted-foreground">
          <div>
            <dt className="inline">Última sincronización: </dt>
            <dd className="inline text-foreground">
              {connection.last_synced_at
                ? formatInstant(connection.last_synced_at, timeZone)
                : "todavía no"}
            </dd>
          </div>
          <div>
            <dt className="inline">Permisos concedidos: </dt>
            <dd className="inline font-mono">
              {Array.isArray(connection.scopes) && connection.scopes.length > 0
                ? connection.scopes.join(", ")
                : "—"}
            </dd>
          </div>
          {connection.last_success_at &&
          connection.last_success_at !== connection.last_synced_at ? (
            <div>
              <dt className="inline">Último éxito: </dt>
              <dd className="inline">
                {formatInstant(connection.last_success_at, timeZone)}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {connection?.last_error ? (
        <p role="alert" className="text-sm text-destructive">
          {connection.last_error}
        </p>
      ) : null}
      {availability.state === "ready" &&
      (!linked || connection?.status === "error") ? (
        <a
          href={`/integrations/${provider.id}/connect`}
          className={buttonVariants({
            size: "lg",
            className: "h-11 justify-self-start",
          })}
        >
          <LinkIcon aria-hidden="true" />
          {linked ? "Volver a conectar" : `Conectar ${provider.name}`}
        </a>
      ) : null}
      {availability.state === "ready" && connection ? (
        <ConnectionControls
          provider={provider.id}
          name={provider.name}
          connected={connection.status === "connected"}
        />
      ) : null}
    </article>
  );
}
