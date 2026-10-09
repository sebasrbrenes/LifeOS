import "server-only";

import { parseEnv } from "./parse";
import {
  SERVER_ENV_KEYS,
  serverEnvSchema,
  type ServerEnv,
} from "./server-schema";

let cached: ServerEnv | undefined;

/** Server-only secrets (never `NEXT_PUBLIC_`). Validated once, lazily. */
export function getServerEnv(): ServerEnv {
  cached ??= parseEnv(
    "server",
    serverEnvSchema,
    Object.fromEntries(SERVER_ENV_KEYS.map((key) => [key, process.env[key]])),
  );
  return cached;
}
