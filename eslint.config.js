import eslint from '@eslint/js';
import prettierPluginRecommended from 'eslint-plugin-prettier/recommended';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  prettierPluginRecommended,
  {
    files: ['**/*.ts'],
    plugins: {
      '@typescript-eslint': typescriptEslint,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          vars: 'local',
          args: 'all',
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        { considerDefaultExhaustiveForUnions: true },
      ],
      'no-case-declarations': 'off',
      'no-constant-condition': 'off',
      'prettier/prettier': 'error',
    },
  },
  {
    files: ['eslint.config.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    ignores: ['node_modules/', 'dist/'],
  },
);
