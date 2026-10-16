import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "data/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
    },
  },
  {
    files: ["src/server/engine/**/*.ts", "src/client/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{
        regex: "^(?:ai(?:/|$)|openai(?:/|$)|deepseek(?:/|$)|@(?:ai-sdk|anthropic-ai|google|google-cloud|deepseek)/)",
        message: "Use the provider service abstraction; vendor SDKs belong in provider adapters.",
      }] }],
    },
  },
);
