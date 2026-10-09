import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Spec principle: the score engine is pure and framework-independent.
    files: ["src/lib/scoring/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "next",
                "next/*",
                "react",
                "react-dom",
                "@supabase/*",
                "server-only",
                "@/*",
              ],
              message:
                "src/lib/scoring must stay pure: no framework, database or app imports.",
            },
          ],
        },
      ],
    },
  },
  {
    // The service-role client bypasses RLS: only the integration server
    // layer and its route handlers may use it (ADR-033).
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      // Already stricter: the engine may not import app code at all.
      "src/lib/scoring/**",
      "src/lib/supabase/admin.ts",
      "src/features/integrations/server/**",
      "src/features/integrations/integration-actions.ts",
      "src/app/(app)/integrations/[[]provider]/**",
      "src/app/api/cron/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/supabase/admin",
              message:
                "The service-role client bypasses RLS; use it only in the integrations server layer.",
            },
          ],
        },
      ],
    },
  },
  // Formatting is owned by Prettier; disable conflicting stylistic rules.
  prettier,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "test-results/**",
    "playwright-report/**",
    "blob-report/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
