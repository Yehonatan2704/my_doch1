import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default defineConfig(
  { ignores: ['**/dist/**', '**/build/**', '**/.expo/**', '**/node_modules/**', '**/expo-env.d.ts', '**/mockServiceWorker.js', 'apps/api/src/db/schema.ts', 'apps/api/src/db/relations.ts'] },
  { files: ['**/*.{ts,tsx}'], extends: [tseslint.configs.recommended] },
  prettier,
);
