// =============================================================================
//  ESLint flat config.
//
//  Rules are chosen to catch the failure modes that actually bite an
//  automation suite — floating promises, conditional assertions, skipped
//  tests left behind — rather than to enforce style, which Prettier owns.
// =============================================================================

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import playwright from 'eslint-plugin-playwright';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    // Archived suites are frozen; generated output is not source.
    ignores: [
      'legacy/**',
      // Authored QA deliverables. A couple carry throwaway repro specs that
      // were never part of the framework's tsconfig, so they cannot be typed.
      'docs/qa-reports/**',
      // k6 runs in its own runtime with its own globals (__ENV), not Node.
      'scripts/k6/**',
      'reports/**',
      'storage/**',
      'test-results/**',
      'playwright-report/**',
      'lighthouse-reports/**',
      'node_modules/**',
      'browser-data/**',
      'mcp-server.js',
      'scripts/*.cjs',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // An un-awaited Playwright call is the single most common source of
      // flakiness in a suite this size: the assertion races the action.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',

      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // `any` erases the type safety that makes page objects refactorable.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],

      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  {
    files: ['tests/**/*.ts'],
    ...playwright.configs['flat/recommended'],
    settings: {
      playwright: {
        // Suites gate destructive coverage behind a wrapper:
        //   const destructive = ENV.ALLOW_DESTRUCTIVE ? test : test.skip;
        // Without this the plugin cannot see those as test blocks and reports
        // every assertion inside them as a standalone expect.
        globalAliases: { test: ['destructive'] },
      },
    },
    rules: {
      ...playwright.configs['flat/recommended'].rules,

      // A committed `.only` silently reduces a 900-test run to one test.
      'playwright/no-focused-test': 'error',
      // Hard-coded sleeps are the other main flakiness source; wait on state.
      'playwright/no-wait-for-timeout': 'warn',
      // An assertion inside an if() can pass by never executing.
      'playwright/no-conditional-expect': 'warn',
      // This suite asserts through shared helpers rather than inline expects,
      // which is the point of utils/assertions.ts and helpers/rbac. Without
      // this list the rule reports every such test as assertion-free.
      'playwright/expect-expect': [
        'warn',
        {
          assertFunctionNames: [
            'assertClean',
            'checkA11y',
            'expectNoBrokenImages',
            'expectNoStuckLoader',
            'expectApiAllowed',
            'expectApiDenied',
            'expectControlAvailable',
            'expectControlFenced',
            'expectDenied',
            'expectNavHidden',
            'expectNavVisible',
            'expectRouteAllowed',
            'expectRouteBlocked',
          ],
        },
      ],
      'playwright/no-skipped-test': ['warn', { allowConditional: true }],
      'playwright/valid-expect': 'error',
    },
  },

  // Config and setup files legitimately log and run outside a test context.
  {
    files: ['*.ts', 'config/**/*.ts', 'scripts/**/*.ts'],
    rules: { 'no-console': 'off' },
  },

  prettier,
);
