import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import js from '@eslint/js';
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments';
import tseslint from '@typescript-eslint/eslint-plugin';
import { defineConfig } from 'eslint/config';
import jestPlugin from 'eslint-plugin-jest';
import simpleImportSort from 'eslint-plugin-simple-import-sort';

const jestRecommended = jestPlugin.configs['flat/recommended'];
const tsconfigRootDir = dirname(fileURLToPath(import.meta.url));

const fileNamingRule = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Enforce repository TypeScript file naming' },
    messages: {
      invalidCase: "Filename '{{name}}' must use camelCase, PascalCase, or kebab-case.",
      conceptMismatch: "File '{{name}}' exports '{{concept}}'; use '{{concept}}.ts'.",
    },
  },
  create(context) {
    const filename = context.physicalFilename ?? context.filename;
    const base = filename.split(/[\\/]/u).pop() ?? '';
    if (!base.endsWith('.ts')) return {};
    const first = base.split('.')[0];
    if (first === 'index' || first === 'types') return {};
    const isCamel = /^[a-z][a-zA-Z0-9]*$/u.test(first);
    const isPascal = /^[A-Z][a-zA-Z0-9]*$/u.test(first);
    const isKebab = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(first);
    return {
      Program(node) {
        if (!isCamel && !isPascal && !isKebab) {
          context.report({ data: { name: base }, messageId: 'invalidCase', node });
          return;
        }
        if (!isCamel) return;
        const concept = first.charAt(0).toUpperCase() + first.slice(1);
        for (const statement of node.body) {
          if (statement.type !== 'ExportNamedDeclaration' || !statement.declaration) continue;
          const declaration = statement.declaration;
          const declared = declaration.type === 'VariableDeclaration'
            ? declaration.declarations.map(item => item.id).filter(item => item.type === 'Identifier')
            : declaration.id ? [declaration.id] : [];
          if (declared.some(item => item.name === concept)) {
            context.report({ data: { concept, name: base }, messageId: 'conceptMismatch', node: statement });
            return;
          }
        }
      },
    };
  },
};

const strictTypeAwareRules = {
  'prefer-promise-reject-errors': 'off',
  '@typescript-eslint/await-thenable': 'error',
  '@typescript-eslint/no-deprecated': 'error',
  '@typescript-eslint/no-duplicate-type-constituents': 'error',
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/no-misused-promises': 'error',
  '@typescript-eslint/no-redundant-type-constituents': 'error',
  '@typescript-eslint/no-unsafe-argument': 'error',
  '@typescript-eslint/no-unsafe-assignment': 'error',
  '@typescript-eslint/no-unsafe-call': 'error',
  '@typescript-eslint/no-unsafe-member-access': 'error',
  '@typescript-eslint/no-unsafe-return': 'error',
  '@typescript-eslint/no-unnecessary-type-assertion': 'error',
  '@typescript-eslint/only-throw-error': 'error',
  '@typescript-eslint/prefer-promise-reject-errors': 'error',
  '@typescript-eslint/unbound-method': 'error',
};

export default defineConfig([
  {
    ignores: ['.context/**', 'coverage/**', 'dist/**', 'node_modules/**'],
  },
  js.configs.recommended,
  {
    files: ['eslint.config.mjs', 'scripts/**/*.mjs', 'tests/**/*.mjs'],
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
      },
    },
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: {
      'simple-import-sort/exports': 'error',
      'simple-import-sort/imports': 'error',
    },
  },
  ...tseslint.configs['flat/recommended'],
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    plugins: {
      local: { rules: { 'file-naming': fileNamingRule } },
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      'local/file-naming': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'separate-type-imports', prefer: 'type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { args: 'none', ignoreRestSiblings: true }],
      'simple-import-sort/exports': 'error',
      'simple-import-sort/imports': 'error',
    },
  },
  {
    // These files retain the exact accepted Claudian migration bytes. New
    // modules still enter through the import-order gate above.
    files: [
      'src/CollabCloudBinding.ts',
      'src/CollabCloudProjectEvent.ts',
      'src/CollabCloudProjectSnapshot.ts',
      'src/CollabRequestTicketRequestCodecs.ts',
      'src/CollabRequestTicketResponseCodecs.ts',
      'src/DevelopmentBootstrap.ts',
      'src/index.ts',
      'tests/CloudBindingV1.test.ts',
      'tests/CollabError.test.ts',
      'tests/DevelopmentBootstrapContract.test.ts',
      'tests/packaging.test.ts',
      'tests/types.test.ts',
    ],
    rules: {
      'simple-import-sort/exports': 'off',
      'simple-import-sort/imports': 'off',
    },
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: { project: './tsconfig.json', tsconfigRootDir },
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
      reportUnusedInlineConfigs: 'error',
    },
    plugins: { 'eslint-comments': eslintComments },
    rules: {
      ...strictTypeAwareRules,
      'eslint-comments/require-description': 'error',
    },
  },
  {
    files: ['tests/**/*.ts'],
    ...jestRecommended,
    rules: {
      ...jestRecommended.rules,
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
]);
