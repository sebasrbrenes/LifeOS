import { z } from "zod";

/**
 * Server-only secrets for integrations. Every variable is optional: the
 * app runs without them and each provider reports itself as "not
 * configured". When present, values are validated (never echoed).
 */
const base64Key = z.string().refine(
  (value) => {
    try {
      return Buffer.from(value, "base64").length === 32;
    } catch {
      return false;
    }
  },
  { message: "must be 32 bytes, base64-encoded" },
);

export const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  TOKEN_ENCRYPTION_KEY: base64Key.optional(),
  STRAVA_CLIENT_ID: z.string().regex(/^\d+$/, "must be numeric").optional(),
  STRAVA_CLIENT_SECRET: z.string().min(10).optional(),
  GOOGLE_CLIENT_ID: z
    .string()
    .regex(
      /\.apps\.googleusercontent\.com$/,
      "must be a Google OAuth client id",
    )
    .optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(10).optional(),
  GOOGLE_HEALTH_ENABLED: z.enum(["true", "false"]).optional(),
  /** Claude API key for the optional AI coach (spec §30). */
  ANTHROPIC_API_KEY: z.string().min(20).optional(),
  AI_MODEL: z
    .string()
    .regex(/^[a-z0-9.-]{3,100}$/, "must be a model id")
    .optional(),
  /** Shared secret Vercel Cron sends as "Authorization: Bearer …". */
  CRON_SECRET: z.string().min(32, "must be at least 32 characters").optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export const SERVER_ENV_KEYS = Object.keys(
  serverEnvSchema.shape,
) as (keyof ServerEnv)[];

export type Provider =
  "strava" | "google_calendar" | "google_health" | "github";

export type ProviderAvailability =
  | { state: "ready" }
  | { state: "not_configured"; missing: (keyof ServerEnv)[] }
  | { state: "unavailable"; reason: "provider_closed" | "not_built" };

const SHARED: (keyof ServerEnv)[] = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "TOKEN_ENCRYPTION_KEY",
];
const PROVIDER_KEYS: Record<"strava" | "google_calendar", (keyof ServerEnv)[]> =
  {
    strava: ["STRAVA_CLIENT_ID", "STRAVA_CLIENT_SECRET"],
    google_calendar: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  };

/**
 * Whether a provider can be connected on this server, and if not, which
 * variables are missing (names only). Google Health stays unavailable
 * until Google onboards new projects (spec §16), whatever the flag says
 * without credentials.
 */
export function providerAvailability(
  env: ServerEnv,
  provider: Provider,
): ProviderAvailability {
  if (provider === "google_health")
    return { state: "unavailable", reason: "provider_closed" };
  if (provider === "github")
    return { state: "unavailable", reason: "not_built" };
  const missing = [...SHARED, ...PROVIDER_KEYS[provider]].filter(
    (key) => !env[key],
  );
  return missing.length === 0
    ? { state: "ready" }
    : { state: "not_configured", missing };
}
