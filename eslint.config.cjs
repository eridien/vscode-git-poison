const js = require('@eslint/js');
const globals = require('globals');

/** @type {import('eslint').Linter.FlatConfig[]} */
module.exports = [
  { ignores: ['out/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: require('@typescript-eslint/parser'),
      parserOptions: {
        project: './tsconfig.json',
        sourceType: 'module',
        ecmaVersion: 'latest',
      },
      globals: {
        ...globals.node,  // This includes all Node.js globals including timers
      }
    },
    plugins: { '@typescript-eslint': require('@typescript-eslint/eslint-plugin') },
    rules: {
      "@typescript-eslint/no-floating-promises": "error", 
      "@typescript-eslint/require-await": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/naming-convention": ["warn", {
        selector: "import",
        format: ["camelCase", "PascalCase"],
      }],
      "curly": "off",
      "eqeqeq": "off", 
      "no-throw-literal": "warn",
      "semi": "warn", 
      "no-unused-vars": "off",
    },
  },
];