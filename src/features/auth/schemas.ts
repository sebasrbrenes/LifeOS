import { z } from "zod";

/** bcrypt — used by Supabase Auth — ignores bytes beyond 72. */
const PASSWORD_MAX_LENGTH = 72;
export const PASSWORD_MIN_LENGTH = 8;

const email = z
  .string({ error: "Introduce tu email." })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Introduce un email válido." }));

const newPassword = z
  .string({ error: "Introduce una contraseña." })
  .min(PASSWORD_MIN_LENGTH, {
    error: `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
  })
  .max(PASSWORD_MAX_LENGTH, {
    error: `La contraseña no puede superar ${PASSWORD_MAX_LENGTH} caracteres.`,
  });

const passwordsMatch = (value: { password: string; confirmPassword: string }) =>
  value.password === value.confirmPassword;

const mismatch = {
  error: "Las contraseñas no coinciden.",
  path: ["confirmPassword"],
};

export const signInSchema = z.object({
  email,
  // Never apply new-password rules at sign-in: an existing account may
  // predate them, and the rules would leak policy details.
  password: z
    .string({ error: "Introduce tu contraseña." })
    .min(1, { error: "Introduce tu contraseña." }),
  next: z.string().optional(),
});

/**
 * Browser-reported IANA timezone, used to seed the profile so daily
 * aggregation uses local dates (FR-002). Anything malformed is dropped
 * rather than blocking sign-up; the database re-validates against
 * pg_timezone_names and falls back to UTC.
 */
const browserTimezone = z
  .string()
  .max(64)
  .regex(/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/)
  .optional()
  .catch(undefined);

export const signUpSchema = z
  .object({
    email,
    password: newPassword,
    confirmPassword: z.string(),
    timezone: browserTimezone,
  })
  .refine(passwordsMatch, mismatch);

export const forgotPasswordSchema = z.object({ email });

export const updatePasswordSchema = z
  .object({ password: newPassword, confirmPassword: z.string() })
  .refine(passwordsMatch, mismatch);

export type FieldErrors = Partial<Record<string, string>>;

export type ParseResult<T> =
  { success: true; data: T } | { success: false; fieldErrors: FieldErrors };

/** Validates FormData and returns the first error message per field. */
export function parseFormData<TSchema extends z.ZodType>(
  schema: TSchema,
  formData: FormData,
): ParseResult<z.infer<TSchema>> {
  const raw: Record<string, FormDataEntryValue> = {};
  for (const [key, value] of formData.entries()) {
    // Ignore React's internal $ACTION_* fields and file uploads.
    if (!key.startsWith("$") && typeof value === "string") {
      raw[key] = value;
    }
  }

  const result = schema.safeParse(raw);
  if (result.success) {
    return { success: true, data: result.data };
  }

  const fieldErrors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "form";
    fieldErrors[key] ??= issue.message;
  }
  return { success: false, fieldErrors };
}
