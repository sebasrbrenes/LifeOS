/**
 * Runs once when a server instance boots. Validating configuration here
 * makes a misconfigured deployment fail immediately with a clear list of
 * missing variables instead of on the first sign-in attempt.
 */
export async function register() {
  const { getPublicEnv } = await import("@/lib/env/public");
  getPublicEnv();
}
