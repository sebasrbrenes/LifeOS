import { z } from "zod";

import { parseEnv } from "./parse";

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url({ protocol: /^https?$/ }),
  NEXT_PUBLIC_SUPABASE_URL: z.url({ protocol: /^https?$/ }),
  // Supabase "anon" or "publishable" key. Safe to expose: every table is
  // protected by Row Level Security.
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

let cached: PublicEnv | undefined;

/**
 * Environment variables that are safe to ship to the browser.
 *
 * Each `process.env.NEXT_PUBLIC_*` access must stay literal so Next.js can
 * inline the value into the client bundle. Validation is lazy so static
 * parts of the build don't require configuration; `instrumentation.ts`
 * validates eagerly when the server boots.
 */
export function getPublicEnv(): PublicEnv {
  cached ??= parseEnv("public", publicEnvSchema, {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  return cached;
}
