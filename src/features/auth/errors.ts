export type AuthOperation =
  "sign-in" | "sign-up" | "forgot-password" | "update-password";

type AuthErrorLike = { code?: string | null; status?: number | null };

const RATE_LIMITED =
  "Demasiados intentos. Espera unos minutos y vuelve a intentarlo.";
const GENERIC = "Algo salió mal. Inténtalo de nuevo.";

/**
 * Turns a Supabase Auth error into a user-facing message.
 *
 * Messages deliberately avoid revealing whether an account exists for an
 * email (account enumeration).
 */
export function authErrorMessage(
  error: AuthErrorLike,
  operation: AuthOperation,
): string {
  switch (error.code) {
    case "invalid_credentials":
      return "Email o contraseña incorrectos.";
    case "email_not_confirmed":
      return "Confirma tu email antes de iniciar sesión. Revisa tu bandeja de entrada.";
    case "user_already_exists":
    case "email_exists":
      return "No se pudo completar el registro. Si ya tienes cuenta, inicia sesión.";
    case "weak_password":
      return "La contraseña es demasiado débil. Usa una más larga o menos común.";
    case "same_password":
      return "La nueva contraseña debe ser distinta de la actual.";
    case "signup_disabled":
    case "email_provider_disabled":
      return "El registro con email está desactivado.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return RATE_LIMITED;
    case "session_not_found":
    case "session_expired":
    case "refresh_token_not_found":
      return operation === "update-password"
        ? "El enlace de recuperación ha caducado. Solicita uno nuevo."
        : "Tu sesión ha caducado. Inicia sesión de nuevo.";
  }

  if (error.status === 429) {
    return RATE_LIMITED;
  }
  // supabase-js reports network failures with status 0.
  if (error.status === 0) {
    return "No se pudo conectar con el servidor. Comprueba tu conexión.";
  }
  return GENERIC;
}
