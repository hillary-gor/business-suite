import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

/**
 * Lint configuration.
 *
 * Written as a native flat config rather than through the FlatCompat bridge,
 * because the bridge loads the legacy eslintrc machinery and breaks on modern
 * ESLint. Composing the three plugins directly is a few more lines and does
 * not depend on a compatibility shim continuing to work.
 *
 * The rule worth knowing about is the last one: it blocks the ways monetary
 * arithmetic gets done accidentally in JavaScript, so that every amount goes
 * through the decimal helpers in lib/money.ts.
 */
export default tseslint.config(
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'supabase/.temp/**',
      'next-env.d.ts',
      'server/db/schema.generated.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx,mjs,js}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    plugins: {
      '@next/next': nextPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // `any` disables the checking that makes a financial system safe to
      // change. If a type is genuinely unknown, `unknown` says so honestly and
      // forces a narrowing at the point of use.
      '@typescript-eslint/no-explicit-any': 'error',
      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error', 'log'] }],
    },
  },

  {
    /**
     * Monetary arithmetic is confined to the money module.
     *
     * These are the routes by which a decimal amount silently becomes an IEEE
     * 754 double: parseFloat on a string from the database, Number() on the
     * same, and the global isNaN that people reach for to check the result.
     * Each is fine in general JavaScript and wrong here, so they are blocked
     * with a message pointing at the alternative.
     */
    files: [
      'app/**/*.{ts,tsx}',
      'server/**/*.{ts,tsx}',
      'components/**/*.{ts,tsx}',
      'lib/**/*.{ts,tsx}',
      'proxy.ts',
    ],
    ignores: ['lib/money.ts', 'lib/money.test.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'parseFloat',
          message:
            'parseFloat produces a float and loses precision. Use Money.from() from @/lib/money.',
        },
        {
          name: 'parseInt',
          message:
            'Use Number() for genuine integers such as counts, or Money.from() for any amount.',
        },
        {
          name: 'isNaN',
          message: 'Use Number.isNaN, or Money.from() which rejects a bad value outright.',
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'round',
          message:
            'Math.round operates on floats and rounds half up only for positives. Use Money.round().',
        },
      ],
    },
  },

  {
    // The generated types file and the scripts are plain Node, not app code.
    files: ['scripts/**/*.mjs', '*.config.{ts,mjs}'],
    rules: {
      'no-console': 'off',
    },
  },
);
