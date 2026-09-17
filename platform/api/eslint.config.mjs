// ESLint (flat config) for the API. Focus: correctness and security-relevant patterns,
// not formatting (Prettier owns formatting).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'uploads/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // Legacy code uses `any` widely at API boundaries; DTOs now validate inputs.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/no-require-imports': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      eqeqeq: ['error', 'smart'],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-restricted-syntax': [
        'error',
        { selector: "CallExpression[callee.property.name='$queryRawUnsafe']", message: 'Use tagged $queryRaw (parameterized).' },
        { selector: "CallExpression[callee.property.name='$executeRawUnsafe']", message: 'Use tagged $executeRaw (parameterized).' },
      ],
    },
  },
  {
    files: ['prisma/**/*.ts', 'test/**/*.ts', '**/*.spec.ts'],
    rules: { 'no-console': 'off' },
  },
);
