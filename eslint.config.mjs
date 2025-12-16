import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import mantineConfig from "eslint-config-mantine";
import oxlintPlugin from "eslint-plugin-oxlint";
import typescriptPlugin from "typescript-eslint";

/**
 * @type {import("eslint").Linter.Config[]}
 */
export default defineConfig(
  // Basic
  eslint.configs.recommended,
  ...mantineConfig,

  // Typescript
  {
    name: "typescript",
    extends: [typescriptPlugin.configs.recommended],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: process.cwd(),
      },
    },
  },

  // Oxlint
  {
    name: "oxlint",
    extends: [oxlintPlugin.configs["flat/react"]],
  },
);
