/**
 * Content-Security-Policy (ADR-029). Pure so it can be unit-tested and
 * imported by next.config.ts.
 *
 * Scripts allow 'unsafe-inline' because Next.js inlines its bootstrap
 * scripts and nonces would force every page to render dynamically
 * (no Partial Prerendering). Everything else is locked to this origin
 * plus Supabase; OAuth providers are top-level navigations, which CSP
 * doesn't restrict.
 */
export function buildContentSecurityPolicy({
  supabaseUrl,
  development,
}: {
  supabaseUrl: string | undefined;
  development: boolean;
}): string {
  const supabase = (() => {
    try {
      const url = new URL(supabaseUrl ?? "");
      return url.protocol === "https:" || url.protocol === "http:"
        ? [
            url.origin,
            `${url.protocol === "https:" ? "wss" : "ws"}://${url.host}`,
          ]
        : [];
    } catch {
      return [];
    }
  })();

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      // React's dev tooling evaluates code; never in production.
      ...(development ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...supabase, ...(development ? ["ws:"] : [])],
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "object-src": ["'none'"],
  };

  return [
    ...Object.entries(directives).map(
      ([name, values]) => `${name} ${values.join(" ")}`,
    ),
    ...(development ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}
