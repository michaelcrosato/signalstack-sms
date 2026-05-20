import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  { ignores: [".next/**", "node_modules/**", "playwright-report/**", "test-results/**", "next-env.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        React: "readonly",
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        URL: "readonly",
        Request: "readonly",
        Response: "readonly"
      }
    }
  }
];
