/// <reference types="vitest/config" />
import { configDefaults } from 'vitest/config';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 3000
  },
  test: {
    // Security rules tests need the Firestore emulator: `npm run test:rules`
    exclude: [...configDefaults.exclude, 'rules-tests/**']
  }
});
