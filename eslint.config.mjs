// Flat config: lint TS/TSX across apps/cli and packages/*.
// `eslint-config-prettier` is last so it disables stylistic rules
// (formatting is handled by prettier in `just check`).

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "**/node_modules/**",
      "apps/server/**",
      "apps/cli/dist/**",
      "packages/proto-gen/src/dox/**",
      "packages/proto-gen/src/google/**",
      "docs/**",
      "docker/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  prettier,
);
