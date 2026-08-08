/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    // `project: true` tells @typescript-eslint to find the nearest tsconfig.json
    // automatically for every file. Required by recommended-requiring-type-checking.
    project: true,
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint', 'import'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'prettier',
  ],
  rules: {
    // TypeScript — no `any` allowed (mirrors strict: true in tsconfig)
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
    '@typescript-eslint/explicit-function-return-type': ['warn', { allowExpressions: true }],

    // Import ordering
    'import/order': [
      'error',
      {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        'newlines-between': 'always',
        alphabetize: { order: 'asc', caseInsensitive: true },
      },
    ],
    'import/no-duplicates': 'error',
    // Disable unresolved check — TypeScript's compiler already validates this
    // and the node resolver can't handle .js extension aliases used with NodeNext.
    'import/no-unresolved': 'off',

    // General
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    eqeqeq: ['error', 'always'],
    curly: ['error', 'all'],
    'prefer-const': 'error',
  },
  settings: {
    'import/resolver': {
      // Use the node resolver only — the TypeScript resolver has compatibility
      // issues with pnpm's virtual store layout. TypeScript itself handles
      // module resolution; ESLint only needs to resolve external packages.
      node: {
        extensions: ['.js', '.ts', '.tsx', '.d.ts'],
      },
    },
  },
  overrides: [
    // ── Backend service apps ───────────────────────────────────────────────
    {
      files: ['apps/api-gateway/**/*.ts'],
      parserOptions: { project: './apps/api-gateway/tsconfig.json' },
    },
    {
      files: ['apps/auth-service/**/*.ts'],
      parserOptions: { project: './apps/auth-service/tsconfig.json' },
    },
    {
      files: ['apps/user-service/**/*.ts'],
      parserOptions: { project: './apps/user-service/tsconfig.json' },
    },
    {
      files: ['apps/catalog-service/**/*.ts'],
      parserOptions: { project: './apps/catalog-service/tsconfig.json' },
    },
    {
      files: ['apps/stream-service/**/*.ts'],
      parserOptions: { project: './apps/stream-service/tsconfig.json' },
    },
    {
      files: ['apps/search-service/**/*.ts'],
      parserOptions: { project: './apps/search-service/tsconfig.json' },
    },
    {
      files: ['apps/playlist-service/**/*.ts'],
      parserOptions: { project: './apps/playlist-service/tsconfig.json' },
    },
    {
      files: ['apps/notification-service/**/*.ts'],
      parserOptions: { project: './apps/notification-service/tsconfig.json' },
    },
    {
      files: ['apps/analytics-service/**/*.ts'],
      parserOptions: { project: './apps/analytics-service/tsconfig.json' },
    },
    {
      files: ['apps/recommendation-service/**/*.ts'],
      parserOptions: { project: './apps/recommendation-service/tsconfig.json' },
    },

    // ── Shared packages ────────────────────────────────────────────────────
    {
      files: ['packages/shared-types/**/*.ts'],
      parserOptions: { project: './packages/shared-types/tsconfig.json' },
    },
    {
      files: ['packages/shared-middleware/**/*.ts'],
      parserOptions: { project: './packages/shared-middleware/tsconfig.json' },
    },
    {
      files: ['packages/shared-utils/**/*.ts'],
      parserOptions: { project: './packages/shared-utils/tsconfig.json' },
    },

    // ── React / Vite web app ───────────────────────────────────────────────
    {
      files: ['apps/web/**/*.{ts,tsx}'],
      env: {
        browser: true,
        node: false,
      },
      parserOptions: {
        project: './apps/web/tsconfig.json',
      },
      extends: ['plugin:react-hooks/recommended'],
      rules: {
        'no-console': ['warn', { allow: ['warn', 'error'] }],
      },
    },

    // ── Test files — relax strict rules ───────────────────────────────────
    {
      files: ['**/*.test.ts', '**/*.spec.ts', '**/*.test.tsx'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
      },
    },
  ],
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'build/',
    '.turbo/',
    'coverage/',
    '*.config.js',
    '*.config.cjs',
    '*.config.ts',
  ],
};
