import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 60000,
    hookTimeout: 60000,
    maxConcurrency: 1,    
    sequence: {
      concurrent: false,
      shuffle: true,
      hooks: 'parallel'
    }
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});