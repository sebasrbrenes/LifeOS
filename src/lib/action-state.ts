/** State returned by form Server Actions to `useActionState`. */
export type ActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<Record<string, string>>;
};

export const idleState: ActionState = { status: "idle" };

type PostgrestErrorLike = { code?: string; message?: string };

/**
 * User-facing copy for database errors. Never echoes the raw message,
 * which can contain internal details.
 */
export function databaseErrorMessage(error: PostgrestErrorLike): string {
  switch (error.code) {
    case "23503":
      return "Este elemento está en uso o depende de algo que ya no existe.";
    case "23505":
      return "Ya existe un elemento igual.";
    case "23514":
      return "Algún valor no cumple las reglas permitidas.";
    case "42501":
      return "No tienes permiso para hacer esto.";
    case "PGRST116":
      return "No se encontró el elemento.";
    default:
      return "No se pudo guardar. Inténtalo de nuevo.";
  }
}

export function logDatabaseError(context: string, error: PostgrestErrorLike) {
  // Code only: messages can include user data.
  console.error(`[db] ${context} failed`, { code: error.code ?? null });
}
