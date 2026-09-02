import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Git worktrees are separate checkouts; lint only the main tree.
    ".worktrees/**",
    // Docusaurus generates these files; source under website/ remains linted.
    "website/.docusaurus/**",
    "website/build/**",
    // Resident self-service is not a rollout surface; lint the admin/shared program.
    "src/app/(resident)/**",
    "src/components/resident-portal/**",
  ]),
]);

export default eslintConfig;
