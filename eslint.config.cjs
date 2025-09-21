// eslint.config.cjs
const js = require('@eslint/js');

/** @type {import('eslint').Linter.FlatConfig[]} */
module.exports = [
  { ignores: ['out/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: require('@typescript-eslint/parser'),
      parserOptions: {
        project: false, // set to 'tsconfig.json' if you want type-aware rules later
        sourceType: 'module',
        ecmaVersion: 'latest',
      },
    },
    plugins: { '@typescript-eslint': require('@typescript-eslint/eslint-plugin') },
    rules: {
      "@typescript-eslint/no-floating-promises": "error", 
      "@typescript-eslint/require-await":        "error",
      "@typescript-eslint/await-thenable":       "error",
      "@typescript-eslint/naming-convention":   ["warn", {
          selector: "import",
          format: ["camelCase", "PascalCase"],
        }],
      curly:  "off",
      eqeqeq: "off", "no-throw-literal": "warn",
      semi:   "warn", "no-unused-vars": "off",
    },
  },
];
