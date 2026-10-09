/** Messages for the OAuth callback's `?connected=` / `?error=` codes. */
const ERRORS: Record<string, string> = {
  not_configured: "Esta integración no está configurada en el servidor.",
  invalid_state:
    "La conexión caducó o no se pudo verificar. Vuelve a intentarlo desde aquí.",
  denied: "No se concedió el acceso. No se ha conectado nada.",
  missing_scope:
    "Hace falta el permiso de lectura para importar datos. Vuelve a conectar y acéptalo.",
  exchange_failed:
    "No se pudo completar la conexión con el proveedor. Inténtalo de nuevo más tarde.",
  first_sync_failed:
    "Conectado, pero la primera sincronización falló. Revisa el estado abajo.",
  unknown_provider: "Integración desconocida.",
};

const NAMES: Record<string, string> = {
  strava: "Strava",
  google_calendar: "Google Calendar",
};

export function integrationNotice(params: {
  connected?: string | string[];
  error?: string | string[];
}): { status: "success" | "error"; message: string } | null {
  const error = typeof params.error === "string" ? params.error : null;
  const connected =
    typeof params.connected === "string" ? NAMES[params.connected] : undefined;
  if (error && ERRORS[error])
    return { status: "error", message: ERRORS[error] };
  if (connected)
    return {
      status: "success",
      message: `${connected} conectado. Enlaza tus métricas a sus datos desde cada métrica (Origen de los datos).`,
    };
  return null;
}
