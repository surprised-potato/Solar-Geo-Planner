import { defineConfig } from 'vitest/config';

// Firestore security rules tests. Run with `npm run test:rules` (starts the Firestore emulator).
export default defineConfig({
  test: {
    include: ['rules-tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20000
  }
});
