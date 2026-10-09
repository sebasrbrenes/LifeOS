import type { z } from "zod";

export class EnvValidationError extends Error {
  constructor(scope: string, problems: string[]) {
    super(
      `Invalid ${scope} environment variables:\n${problems
        .map((problem) => `  - ${problem}`)
        .join("\n")}\nSee .env.example and docs/SETUP.md.`,
    );
    this.name = "EnvValidationError";
  }
}

/**
 * Validates a set of environment variables against a schema.
 *
 * Error messages name the offending keys but never echo their values, so a
 * misconfigured secret cannot leak into logs or error overlays.
 */
export function parseEnv<TSchema extends z.ZodType>(
  scope: string,
  schema: TSchema,
  source: Record<string, string | undefined>,
): z.infer<TSchema> {
  // Treat empty strings as unset so `KEY=` in a .env file fails validation.
  const normalized = Object.fromEntries(
    Object.entries(source).map(([key, value]) => [
      key,
      value === "" ? undefined : value,
    ]),
  );

  const result = schema.safeParse(normalized);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => {
      const key = issue.path.join(".") || "(root)";
      return issue.code === "invalid_type" && issue.input === undefined
        ? `${key}: is required`
        : `${key}: ${issue.message}`;
    });
    throw new EnvValidationError(scope, problems);
  }
  return result.data;
}
