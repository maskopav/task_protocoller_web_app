import { test, expect, type Page } from '@playwright/test';

// Fixed access_token from backend/scripts/seed/e2e_participant_seed.sql,
// re-applied fresh before every E2E run (see playwright.config.ts webServer
// -> "npm run db:test:reset"). That seed builds one protocol with:
//   consent -> mic check (auto-injected, a voice task is present)
//   -> syllableRepeating (voice, 3s countdown)
//   -> sdmt (cognitive, 3s countdown)
//   -> questionnaire (1 required question)
//   -> completion screen
const PARTICIPANT_TOKEN = 'e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2';

async function passMicCheck(page: Page) {
  // Mic permission is pre-granted (playwright.config.ts `permissions`), so
  // MicCheck's "Allow Microphone Access" screen is skipped, landing straight
  // on the noise-calibration recorder. That recorder is countDown mode but
  // NOT auto-started on a first attempt (MicCheck.jsx passes
  // autoStart={isRetry} — only retries auto-start), so it still needs an
  // explicit Start click; only autoSubmit (submit-once-recorded) is
  // automatic. A real speech WAV is fed in as the fake audio device, so this
  // should pass on the first attempt, but the loop still handles a retry or
  // the silent auto-advance-after-2-failures path.
  for (let attempt = 0; attempt < 3; attempt++) {
    // Wait for Start to render rather than a point-in-time visibility check —
    // this screen mounts right after the consent transition, so an instant
    // check can race the render and miss it, leaving the recording never
    // started and the whole attempt silently burned waiting for a result
    // that will never come.
    await page.locator('.btn-start').click({ timeout: 5_000 }).catch(() => {});

    const proceed = page.getByRole('button', { name: 'Next' });
    const retry = page.getByRole('button', { name: 'Check Microphone Again' });

    const result = await Promise.race([
      proceed.waitFor({ state: 'visible', timeout: 20_000 }).then(() => 'proceed' as const),
      retry.waitFor({ state: 'visible', timeout: 20_000 }).then(() => 'retry' as const),
    ]).catch(() => null);

    if (result === 'proceed') {
      await proceed.click();
      return;
    }
    if (result === 'retry') {
      await retry.click();
      continue; // another 12s calibration recording follows
    }
    // Neither showed up within the window — the auto-advance path (after 2
    // failed attempts) has no button to click; give it a moment and check
    // whether we already moved on to the next screen.
    return;
  }
}

async function completeVoiceTask(page: Page) {
  await page.locator('.btn-start').click();
  // countDown mode auto-stops itself (seeded duration: 3s) and shows a
  // playback screen with a "Next" button once recordingStatus === RECORDED.
  await page.getByRole('button', { name: 'Next' }).click({ timeout: 15_000 });
}

async function completeSdmtTask(page: Page) {
  // An in-page "Symbol matching task" demo card (with its own "Ok" button,
  // NOT a native window.confirm()) covers the instructions screen on mount
  // and must be dismissed before Start does anything.
  await page.getByRole('button', { name: 'Ok' }).click({ timeout: 10_000 });
  await page.locator('.btn-start').click({ timeout: 15_000 });
  // Runs on its own internal timer (seeded duration: 3s); no input required
  // to finish. Give it a little slack past the seeded duration.
  await page.getByRole('button', { name: 'Next' }).click({ timeout: 15_000 });
}

async function completeQuestionnaire(page: Page) {
  await page.getByRole('radio', { name: 'Good' }).check();
  await page.locator('.btn-submit-questionnaire').click({ timeout: 5_000 });
}

test('participant completes a full protocol run: consent, mic check, voice task, cognitive task, questionnaire', async ({ page }) => {
  // MicCheck's "muted" dead-end uses a native window.confirm() — auto-accept
  // every dialog for the whole test so that path can't hang it.
  page.on('dialog', (dialog) => dialog.accept());
  page.on('pageerror', (err) => console.log('PAGEERROR:', err.message));

  // The app uses HashRouter (frontend/src/main.jsx), so the route lives in
  // the URL fragment, not the path.
  await page.goto(`/#/participant/${PARTICIPANT_TOKEN}`);
  // The Loader fetches the protocol then internally navigates (with router
  // state) to /participant/interface — never goto that URL directly, it
  // requires state only the Loader provides.
  await page.waitForURL(/#\/participant\/interface$/, { timeout: 20_000 });

  // 1. Volume check (always first, system task) — any option unlocks Next.
  await page.getByRole('button', { name: '32', exact: true }).click();
  await page.locator('.btn-next').click();

  // ParticipantInterfacePage.jsx debounces task transitions for 350ms
  // (TRANSITION_LOCK_MS) after each handleTaskComplete call; back-to-back
  // system screens (volume check -> consent, both instant, no recording in
  // between) can otherwise have their second click silently swallowed by
  // that lock rather than advancing.
  await page.waitForTimeout(500);

  // 2. Consent (use_audio_guide=0 and no info/instructions content seeded,
  // so this is the very next screen). Both i18n keys involved are missing
  // translations in common.json and render as literal key strings, so this
  // deliberately does not select by visible text.
  await page.locator('#consent-check').check();
  await page.locator('.btn-primary').click();

  // 3. Mic check (auto-injected because the protocol has a voice task).
  await passMicCheck(page);

  // 4. syllableRepeating — voice task, countDown mode, 3s.
  await completeVoiceTask(page);

  // 5. sdmt — cognitive task, countDown mode, 3s, no participant input needed.
  await completeSdmtTask(page);

  // 6. Questionnaire — one required single-choice question.
  await completeQuestionnaire(page);

  // 7. Completion screen — only reached once every recording/result has
  // actually finished uploading to the backend (polled via IndexedDB).
  await expect(page.getByText(/Responses saved successfully/i)).toBeVisible({ timeout: 30_000 });
});
