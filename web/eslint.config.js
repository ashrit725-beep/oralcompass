// Hook rules only (web-correctness-31): rules-of-hooks is an error, exhaustive-deps a warning. Every `eslint-disable` needs a reason
// after "--" (reportUnusedDisableDirectives flags stale ones). Copy is linted separately by `npm run lint:copy` (tools/advice_lint.py).
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default [
  { ignores: ["dist/**", "node_modules/**", "public/**"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    linterOptions: { reportUnusedDisableDirectives: "warn" },
    plugins: { "react-hooks": reactHooks, "@typescript-eslint": tseslint.plugin },
    rules: { "react-hooks/rules-of-hooks": "error", "react-hooks/exhaustive-deps": "warn" },
  },
];
