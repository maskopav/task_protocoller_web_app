import { test, expect } from '@playwright/test';
import { USERS, ensureSeeded, uiLogin } from './helpers/uploads';

test.beforeAll(async ({ request }) => {
  await ensureSeeded(request);
});

test('F-078: opening #/login while signed in redirects to /recordings and keeps the session', async ({ page }) => {
  await uiLogin(page, USERS.master);
  await page.goto('/#/login');
  await expect(page).toHaveURL(/#\/recordings$/);
  await expect(page.locator('input[name="password"]')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('adminToken'))).toBeTruthy();
});

test('F-078: signed out, #/login shows the form; Sign out lands on a cleared login page', async ({ page }) => {
  await page.goto('/#/login');
  await expect(page.locator('input[name="password"]')).toBeVisible();

  await uiLogin(page, USERS.master);
  await page.getByTestId('shell-logout').click();
  await expect(page).toHaveURL(/#\/login$/);
  await expect(page.locator('input[name="password"]')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('adminToken'))).toBeNull();
});
