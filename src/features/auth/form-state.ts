import type { FieldErrors } from "./schemas";

/** State returned by auth Server Actions to `useActionState`. */
export type AuthFormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: FieldErrors;
  /** Echoed back so a failed submit doesn't wipe the email field. */
  email?: string;
};

export const initialAuthFormState: AuthFormState = { status: "idle" };
