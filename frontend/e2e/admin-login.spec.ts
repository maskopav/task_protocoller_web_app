import { test, expect } from '@playwright/test';

// Credentials come from backend/scripts/seed/artificial_data.sql, seeded fresh
// into the disposable task_protocoller_test DB before every E2E run (see
// playwright.config.ts webServer -> "npm run db:test:reset").
const MASTER_EMAIL = 'master@test.com';
const MASTER_PASSWORD = '1234';

test('admin can log in and reach the dashboard', async ({ page }) => {
  await page.goto('/login');

  await page.locator('input[name="email"]').fill(MASTER_EMAIL);
  await page.locator('input[name="password"]').fill(MASTER_PASSWORD);
  await page.locator('button[type="submit"]').click();

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
});

test('shows an error for a wrong password without navigating away', async ({ page }) => {
  await page.goto('/login');

  await page.locator('input[name="email"]').fill(MASTER_EMAIL);
  await page.locator('input[name="password"]').fill('not-the-password');
  await page.locator('button[type="submit"]').click();

  await expect(page.locator('.status-error')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});
