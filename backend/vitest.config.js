import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Vitest 5 clears mock call history before each test by default; src/routes/upload.test.js
    // ("logging") asserts on calls recorded by earlier tests, so keep the Vitest 4 behaviour.
    clearMocks: false,
    include: ['src/**/*.{test,spec}.js', 'test/**/*.{test,spec}.js'],
  },
});
