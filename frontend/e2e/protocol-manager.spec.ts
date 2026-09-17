import { test, expect, type Page } from '@playwright/test';

// Regression coverage for two protocol-manager bugs found on `main` while
// debugging a console log full of repeated 401s on GET /projects/projects-list:
//
// 1. MappingContext.refreshMappings wasn't memoized, so any effect depending
//    on it (e.g. ProjectDashboardPage's loadData) re-fired on every mappings
//    update, in a loop -- flooding the API with repeated requests.
// 2. ProtocolEditorPage never actually fetched a protocol by id -- it relied
//    entirely on React Router's `state`, which a hard refresh or a direct/
//    bookmarked link doesn't have, silently rendering an empty editor.
//
// Project id=1 ("Test Study 001") comes from artificial_data.sql; protocol
// id=1 ("E2E Test Protocol", 3 tasks) from e2e_seed.sql. Both are reseeded
// fresh before every E2E run.
const MASTER_EMAIL = 'master@test.com';
const MASTER_PASSWORD = '1234';
const PROJECT_ID = 1;
const SEEDED_PROTOCOL_ID = 1;
const SEEDED_PROTOCOL_TASK_COUNT = 3;

async function loginAsMaster(page: Page) {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(MASTER_EMAIL);
  await page.locator('input[name="password"]').fill(MASTER_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/admin$/);
}

test('project dashboard does not repeatedly refetch the project list', async ({ page }) => {
  await loginAsMaster(page);

  let projectsListRequests = 0;
  page.on('request', (req) => {
    if (req.url().includes('/projects/projects-list')) projectsListRequests += 1;
  });

  await page.goto(`/#/admin/projects/${PROJECT_ID}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // React StrictMode legitimately double-invokes mount effects in dev, so a
  // healthy mount can fire this request twice -- that's not the bug. The bug
  // was an *uncontrolled* loop: each fetch re-rendering the mappings provider
  // with a new refreshMappings identity, re-triggering the effect again. So
  // the regression check is that the count stops growing once the initial
  // mount settles, not that it equals exactly 1.
  await page.waitForTimeout(1500);
  const afterInitialMount = projectsListRequests;
  expect(afterInitialMount).toBeLessThanOrEqual(2);

  await page.waitForTimeout(1500);
  expect(projectsListRequests).toBe(afterInitialMount);
});

test('opening the protocol editor as a direct link loads the protocol from the backend', async ({ page }) => {
  await loginAsMaster(page);

  // Deliberately skip clicking through from the protocol list. React Router's
  // `state` navigation option is backed by the browser's native history.state,
  // which *survives* a same-tab reload -- so a click-then-reload test would
  // not have caught this. The real failure mode is a navigation with no
  // history.state at all: a bookmarked link, a shared URL, or typing the
  // address directly, exactly like this goto.
  await page.goto(`/#/admin/projects/${PROJECT_ID}/protocols/${SEEDED_PROTOCOL_ID}`);

  // Without the backend fetch fallback this renders an empty editor (0
  // protocol-item rows, the "empty-protocol" placeholder shown) because there
  // is no router state to restore tasks from.
  await expect(page.locator('.protocol-item')).toHaveCount(SEEDED_PROTOCOL_TASK_COUNT);
  await expect(page.locator('.empty-protocol')).toHaveCount(0);
});