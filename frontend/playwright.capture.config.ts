import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Screenshot capture for the UI/UX audit. Not part of `npm run test:e2e`
// (the main config ignores e2e/tools).
// Run: npx playwright test -c playwright.capture.config.ts
export default defineConfig({
  ...base,
  testDir: './e2e/tools',
  testIgnore: [],
  timeout: 180_000,
  use: { ...base.use, actionTimeout: 5000 },
  reporter: [['list']],
});
