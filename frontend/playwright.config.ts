import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_URL = 'https://localhost:5183';
const BACKEND_URL = 'http://localhost:3001';
const BACKEND_DIR = path.resolve(__dirname, '../backend');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: FRONTEND_URL,
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      // Resets + reseeds the disposable E2E database (backend/.env.test),
      // then starts the backend against it. Never points at the real dev DB.
      command: 'npm run db:test:reset && npm run start:test',
      cwd: BACKEND_DIR,
      url: `${BACKEND_URL}/test`,
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npm run dev:e2e',
      cwd: __dirname,
      url: FRONTEND_URL,
      reuseExistingServer: false,
      ignoreHTTPSErrors: true,
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
