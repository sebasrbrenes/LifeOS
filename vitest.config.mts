import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    // Domain logic is environment-agnostic; component tests opt into jsdom
    // with a `// @vitest-environment jsdom` pragma.
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "supabase/tests/**/*.test.ts"],
    restoreMocks: true,
    unstubEnvs: true,
  },
});
