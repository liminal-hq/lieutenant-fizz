import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'packages/**/*.test.ts',
      'episodes/**/*.test.ts',
      'apps/**/*.test.ts',
      'scripts/**/*.test.ts',
    ],
  },
});
