#!/usr/bin/env node
// scripts/exportProtocolScreens.mjs
//
// Walks a protocol the way a participant would -- from a participant link,
// all the way to the completion screen -- screenshots every screen it meets
// and collects them into one Word document (.docx) for documentation
// (ethics submissions, collaborators, manuals).
//
// The run is REAL: answers and recordings are saved to whichever backend the
// link points at, exactly as for a participant. Use a participant marked as
// a tester. Answers are filled with the first option / placeholder text, and
// recordings use a speech WAV fed in as a fake microphone (the same one the
// Playwright E2E tests use) and are stopped after a few seconds.
//
// Usage (from frontend/):
//   npm run export:screens -- "<participant link>" [options]
//   (or: node scripts/exportProtocolScreens.mjs "<participant link>" [options])
//
//   <participant link>  e.g. https://localhost:5173/#/participant/<token>
//                       (the /protocol/<token> registration link is refused --
//                       it would register a new participant)
//   --title "<text>"    document title (default: "Protocol screens")
//   --out <dir>         output folder (default: protocol-screens/<timestamp>)
//   --continue <dir>    append to an earlier, unfinished export in <dir>. The
//                       app saved the participant's progress, so the same link
//                       resumes where that run stopped.
//   --lang <text>       language to pick if the language selector appears,
//                       matched against the button text, e.g. "Čeština"
//   --rebuild <dir>     only regenerate <dir>'s .docx from its screenshots and
//                       screens.json (no link needed; --title still applies)
//   --mobile            phone-sized viewport (Pixel 7) instead of desktop
//   --headed            show the browser window while it runs
//   --record <sec>      stop recordings after this many seconds (default 5)
//   --stuck <sec>       give up on a screen that doesn't change for this long
//                       (default 150 -- long enough for timed tasks)
//
// Output: <out>/NN.png per screen, <out>/screens.json (their titles, used by
// --continue) and <out>/protocol-screens.docx.
//
// Imports `chromium` from @playwright/test, like the other browser scripts
// here (see verifyRecordingPipelineBrowser.mjs for why not playwright-core).
import { chromium, devices } from '@playwright/test';
import { AlignmentType, Document, HeadingLevel, ImageRun, Packer, Paragraph, TextRun } from 'docx';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(__dirname, '..');
// Must be a WAV: Chromium's fake audio capture only reads WAV (see playwright.config.ts).
const FAKE_AUDIO_FILE = path.join(FRONTEND_DIR, 'public/audio/illustrations/en/retelling_redRidingHood.wav');

const POLL_MS = 1000;
const DECLINE_CAMERA_AFTER_MS = 30_000; // fake camera has no face, so calibration never passes
const UPLOAD_WAIT_MS = 60_000;
const MAX_SCREEN_MS = 10 * 60_000; // even a ticking screen is given up on after this

function parseArgs(argv) {
  const opts = { url: null, title: null, out: null, lang: null, mobile: false, headed: false, recordSec: 5, stuckSec: 150 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--title') opts.title = argv[++i];
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '--continue') opts.continueDir = argv[++i];
    else if (a === '--lang') opts.lang = argv[++i];
    else if (a === '--mobile') opts.mobile = true;
    else if (a === '--headed') opts.headed = true;
    else if (a === '--record') opts.recordSec = Number(argv[++i]);
    else if (a === '--stuck') opts.stuckSec = Number(argv[++i]);
    else if (!a.startsWith('--') && !opts.url) opts.url = a;
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!opts.url) throw new Error('Missing participant link. Usage: node scripts/exportProtocolScreens.mjs "<participant link>"');
  if (/\/protocol\//.test(opts.url)) {
    throw new Error('That is a protocol registration link (/protocol/...). Assign the protocol to a tester participant and pass their /participant/... link.');
  }
  if (!/\/participant\/[^/]+/.test(opts.url)) throw new Error(`Not a participant link: ${opts.url}`);
  return opts;
}

// "Next" / "OK" / ... in every app language, for buttons without a dedicated class.
function loadAdvanceLabels() {
  const labels = new Set();
  const i18nDir = path.join(FRONTEND_DIR, 'src/i18n');
  for (const lang of fs.readdirSync(i18nDir)) {
    const file = path.join(i18nDir, lang, 'common.json');
    if (!fs.existsSync(file)) continue;
    const { buttons = {} } = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const key of ['ok', 'next', 'confirm', 'done']) if (buttons[key]) labels.add(buttons[key].trim().toLowerCase());
  }
  return [...labels];
}

// Full text of the screen, digits included -- a running countdown changes
// it, which shows the screen is still progressing even if it looks the same.
function screenText(page) {
  return page.evaluate(() => (document.querySelector('#root') || document.body).innerText).catch(() => '');
}

// Text of the current screen with digits removed, so running timers and
// countdowns don't count as a new screen.
function screenSignature(page) {
  return page.evaluate(() => {
    const root = document.querySelector('#root') || document.body;
    let text = root.innerText;
    for (const el of root.querySelectorAll('.submit-helper-text, .answer-input-error, .spinner')) {
      if (el.innerText) text = text.replace(el.innerText, '');
    }
    return `${location.hash}|${text.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim()}`;
  }).catch(() => '');
}

async function stableSignature(page) {
  let prev = await screenSignature(page);
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(400);
    const next = await screenSignature(page);
    if (next === prev) return next;
    prev = next;
  }
  return prev;
}

// "Task 2 / 3 – <heading>", where the heading is the screen's title or, since
// most task screens have none, the first line of its instructions.
function screenTitle(page) {
  return page.evaluate(() => {
    const firstLine = (sel) => {
      const el = [...document.querySelectorAll(sel)].find((e) => e.innerText?.trim());
      return el?.innerText.trim().split('\n').find((l) => l.trim())?.trim() || '';
    };
    const heading = firstLine(
      '.scent-sheet-title, .language-selector-title, .completion-card h1, .completion-card h2, .task-header h1, .praise-headline, ' +
      '.smell-question, .questionnaire-instructions, .instruction-text, h1, h2'
    );
    const short = heading.length > 80 ? `${heading.slice(0, 77)}...` : heading;
    const progress = firstLine('.task-progress');
    return [progress, short].filter(Boolean).join(' – ');
  }).catch(() => '');
}

async function visible(locator) {
  return locator.isVisible().catch(() => false);
}

// Clicks the first visible, enabled match. Returns whether it clicked.
async function clickFirst(page, selector) {
  const items = page.locator(selector);
  const count = await items.count();
  for (let i = 0; i < count; i++) {
    const el = items.nth(i);
    if (!(await visible(el)) || !(await el.isEnabled().catch(() => false))) continue;
    try {
      await el.click({ timeout: 3000 });
      return true;
    } catch {
      // covered or detached mid-click -- try the next one / next poll
    }
  }
  return false;
}

// Ticks a radio/checkbox. Styled ones hide the input itself (e.g. the vision
// pre-test checklist), which even a forced click can't reach -- the wrapping
// label is what the participant actually clicks.
async function choose(input) {
  if (await visible(input)) return input.check({ timeout: 2000 }).catch(() => {});
  const label = input.locator('xpath=ancestor::label[1]');
  if (await label.count()) return label.click({ timeout: 2000 }).catch(() => {});
  return input.evaluate((el) => el.click()).catch(() => {});
}

// Answers whatever the screen asks for, the way a hurried participant would:
// first option everywhere, placeholder text in text fields.
async function fillScreen(page, opts) {
  let changed = false;

  // Language selector (multi-language protocols)
  if (await visible(page.locator('.language-options-list')) && !(await page.locator('.language-btn.selected').count())) {
    const wanted = opts.lang ? `.language-btn:has-text("${opts.lang}")` : '.language-btn';
    changed = (await clickFirst(page, wanted)) || (await clickFirst(page, '.language-btn')) || changed;
  }

  // Radio groups with nothing checked (questionnaires, vision pre-test checklist)
  const radioNames = await page.evaluate(() => {
    const names = new Set([...document.querySelectorAll('input[type="radio"]')].map((r) => r.name).filter(Boolean));
    return [...names].filter((n) => !document.querySelector(`input[type="radio"][name="${CSS.escape(n)}"]:checked`));
  });
  for (const name of radioNames) {
    await choose(page.locator(`input[type="radio"][name="${name}"]`).first());
    changed = true;
  }

  // Checkbox groups with nothing checked (multiple choice, consent boxes)
  const checkboxNames = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll('input[type="checkbox"]')];
    const groups = new Map();
    boxes.forEach((b, i) => {
      const key = b.name || `__single_${i}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(i);
    });
    return [...groups.values()].filter((idx) => !idx.some((i) => boxes[i].checked)).map((idx) => idx[0]);
  });
  for (const index of checkboxNames) {
    await choose(page.locator('input[type="checkbox"]').nth(index));
    changed = true;
  }

  // Dropdowns still on their placeholder
  const selects = page.locator('select');
  for (let i = 0; i < (await selects.count()); i++) {
    const select = selects.nth(i);
    if (!(await visible(select)) || (await select.inputValue().catch(() => 'x')) !== '') continue;
    const value = await select.evaluate((s) => [...s.options].find((o) => o.value && !o.disabled)?.value);
    if (value) {
      await select.selectOption(value).catch(() => {});
      changed = true;
    }
  }

  // Empty text fields
  const fields = page.locator('input:not([type]), input[type="text"], input[type="email"], input[type="tel"], input[type="date"], input[type="number"], textarea');
  for (let i = 0; i < (await fields.count()); i++) {
    const field = fields.nth(i);
    if (!(await visible(field)) || !(await field.isEditable().catch(() => false))) continue;
    if ((await field.inputValue().catch(() => 'x')) !== '') continue;
    const { type, inputMode } = await field.evaluate((f) => ({ type: f.type, inputMode: f.inputMode }));
    const value = type === 'date' ? '1990-01-01'
      : type === 'email' ? 'tester@example.com'
      : type === 'tel' ? '123456789'
      : type === 'number' || inputMode === 'numeric' ? '30'
      : 'Test';
    await field.fill(value).catch(() => {});
    changed = true;
  }

  // Button-style single choices
  for (const [group, option, selected] of [
    ['.emoji-scale-group', '.emoji-scale-option', '.is-selected'],
    ['.volume-check-options', '.btn-option', '.btn-option--selected'],
  ]) {
    const groups = page.locator(group);
    for (let i = 0; i < (await groups.count()); i++) {
      const g = groups.nth(i);
      if (!(await visible(g)) || (await g.locator(selected).count())) continue;
      await g.locator(option).first().click({ timeout: 2000 }).catch(() => {});
      changed = true;
    }
  }

  // Smell test: pick a scent, then step through its rating sheet
  if (await visible(page.locator('.scent-sheet'))) {
    changed = (await clickFirst(page, '.scent-sheet .scent-rating-option')) || changed;
  } else if (await visible(page.locator('.scent-picker')) && !(await page.locator('.scent-option.is-selected').count())) {
    changed = (await clickFirst(page, '.scent-option')) || changed;
  }

  // D15 colour test: place caps until the tray is full
  if (await clickFirst(page, '.d15-cap.selectable-cap')) changed = true;

  return changed;
}

// Presses whatever moves the participant forward. Order matters: dialogs
// cover the screen, and "Next" must win over "Try again" on playback screens.
async function advance(page, { advanceLabels, screenAgeMs, recordMs }) {
  const byClass = [
    '.confirm-dialog .btn-confirm',
    '.language-confirm-btn',
    '.btn-submit-questionnaire',
    '.btn-permission',
    '.btn-next:not(.is-disabled)',
    '.playback-section .button-group button:not(.btn-repeat)',
    '.btn-start:not(.disabled):not(.btn-loading)',
    '.btn-primary:not(.btn-stop)',
  ];
  // Modal "Ok" cards (e.g. SDMT demo) sit on top of the screen's own buttons.
  const okButton = page.getByRole('button', { name: /^(ok)$/i });
  if (await visible(okButton.first())) {
    await okButton.first().click({ timeout: 3000 }).catch(() => {});
    return 'ok';
  }
  for (const selector of byClass) {
    if (await clickFirst(page, selector)) return selector;
  }
  if (screenAgeMs >= recordMs && (await clickFirst(page, '.btn-stop:not(.disabled)'))) return 'stop';

  const exclude = ['btn-back', 'btn-skip', 'btn-repeat', 'btn-lang', 'btn-primary-back', 'btn-secondary'];
  const buttons = page.locator('button');
  for (let i = 0; i < (await buttons.count()); i++) {
    const b = buttons.nth(i);
    const label = ((await b.innerText().catch(() => '')) || '').trim().toLowerCase();
    if (!advanceLabels.includes(label)) continue;
    const cls = (await b.getAttribute('class')) || '';
    if (exclude.some((c) => cls.split(/\s+/).includes(c))) continue;
    if (await visible(b) && await b.isEnabled()) {
      await b.click({ timeout: 3000 }).catch(() => {});
      return `button "${label}"`;
    }
  }
  return null;
}

function pngSize(buffer) {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function writeDocx(file, { title, url, screens }) {
  const MAX_W = 600; // px at 96 dpi, fits an A4/Letter page with default margins
  const MAX_H = 820;
  const children = [
    new Paragraph({ text: title, heading: HeadingLevel.TITLE }),
    new Paragraph({ children: [new TextRun({ text: `Generated ${new Date().toLocaleString()} from ${url}`, italics: true, size: 18 })] }),
    new Paragraph({ children: [new TextRun({ text: `${screens.length} screens`, size: 18 })] }),
  ];
  screens.forEach((s, i) => {
    const data = fs.readFileSync(path.join(path.dirname(file), s.file));
    const { width, height } = pngSize(data);
    const scale = Math.min(MAX_W / width, MAX_H / height, 1);
    children.push(
      new Paragraph({ text: `${i + 1}. ${s.title || 'Screen'}`, heading: HeadingLevel.HEADING_2, pageBreakBefore: true }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new ImageRun({ type: 'png', data, transformation: { width: Math.round(width * scale), height: Math.round(height * scale) } })],
      }),
    );
    if (s.note) children.push(new Paragraph({ children: [new TextRun({ text: s.note, italics: true, color: '888888', size: 18 })] }));
  });
  const doc = new Document({ creator: 'TaskProtocoller', title, sections: [{ children }] });
  const buffer = await Packer.toBuffer(doc);
  // Word locks an open .docx -- write next to it rather than lose the run.
  for (let n = 0; ; n++) {
    const target = n ? file.replace(/\.docx$/, ` (${n}).docx`) : file;
    try {
      fs.writeFileSync(target, buffer);
      return target;
    } catch (err) {
      if (err.code !== 'EBUSY' && err.code !== 'EPERM') throw err;
      if (n === 0) console.warn(`${path.basename(file)} is open in another program, writing a copy instead.`);
    }
  }
}

// --rebuild <dir>: regenerate the .docx from an export's screenshots and
// screens.json without walking the protocol again (e.g. after deleting or
// retitling screens in screens.json).
async function rebuild(argv) {
  const dir = path.resolve(argv[argv.indexOf('--rebuild') + 1] || '');
  const titleAt = argv.indexOf('--title');
  const screens = JSON.parse(fs.readFileSync(path.join(dir, 'screens.json'), 'utf8'));
  const file = await writeDocx(path.join(dir, 'protocol-screens.docx'), {
    title: titleAt >= 0 ? argv[titleAt + 1] : 'Protocol screens',
    url: '(rebuilt from saved screenshots)',
    screens,
  });
  console.log(`Rebuilt: ${screens.length} screens -> ${file}`);
}

async function main() {
  if (process.argv.includes('--rebuild')) return rebuild(process.argv.slice(2));
  const opts = parseArgs(process.argv.slice(2));
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const outDir = path.resolve(opts.continueDir || opts.out || path.join(FRONTEND_DIR, 'protocol-screens', stamp));
  fs.mkdirSync(outDir, { recursive: true });
  const indexFile = path.join(outDir, 'screens.json');
  const screens = [];
  if (opts.continueDir) {
    if (!fs.existsSync(indexFile)) throw new Error(`No screens.json in ${outDir} -- nothing to continue.`);
    screens.push(...JSON.parse(fs.readFileSync(indexFile, 'utf8')));
    // The earlier run stopped ON its last screen, and the resumed run opens
    // on that same screen -- recapture it rather than keep it twice.
    screens.pop();
    console.log(`Continuing after ${screens.length} earlier screens`);
  }
  const advanceLabels = loadAdvanceLabels();

  const browser = await chromium.launch({
    headless: !opts.headed,
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      `--use-file-for-fake-audio-capture=${FAKE_AUDIO_FILE}`,
      '--autoplay-policy=no-user-gesture-required',
      // Keep task timers (SDMT countdown, recordings) at full speed. Without
      // these, Chromium on Windows may treat a headless window covered by
      // another one (e.g. a second export running) as hidden and throttle
      // its timers to ~1/min -- a phone run's SDMT froze at 89s that way.
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--disable-features=IntensiveWakeUpThrottling,CalculateNativeWinOcclusion',
    ],
  });
  const context = await browser.newContext({
    ...(opts.mobile ? devices['Pixel 7'] : { viewport: { width: 1280, height: 800 } }),
    ignoreHTTPSErrors: true,
    permissions: ['microphone', 'camera'],
  });
  const page = await context.newPage();
  // Native confirm()s (e.g. MicCheck's muted dead-end) would block the run.
  page.on('dialog', (d) => d.accept().catch(() => {}));

  let lastSig = null;
  let screenSince = Date.now();
  let lastText = '';
  let lastProgress = 0;
  let pendingNote = null;

  const capture = async (sig) => {
    const file = `${String(screens.length + 1).padStart(2, '0')}.png`;
    await page.waitForFunction(() => [...document.images].every((img) => img.complete), null, { timeout: 5000 }).catch(() => {});
    await page.screenshot({ path: path.join(outDir, file), fullPage: true });
    const title = await screenTitle(page);
    screens.push({ file, title, note: pendingNote });
    fs.writeFileSync(indexFile, JSON.stringify(screens, null, 2));
    pendingNote = null;
    lastSig = sig;
    screenSince = Date.now();
    console.log(`[${screens.length}] ${title || '(untitled screen)'}`);
  };

  console.log(`Opening ${opts.url}`);
  await page.goto(opts.url);

  let finished = false;
  while (!finished) {
    const sig = await stableSignature(page);
    const loading = await visible(page.locator('.participant-loading__primary'));
    if (sig && sig !== lastSig && !loading) await capture(sig);

    if (await visible(page.locator('.completion-card'))) {
      // Let recordings/answers finish uploading: the page drops the stored
      // participant token once nothing is pending (ParticipantInterfacePage.jsx).
      console.log('Completion screen reached, waiting for uploads...');
      await page.waitForFunction(() => localStorage.getItem('neuroSHARE_tokenId') === null, null, { timeout: UPLOAD_WAIT_MS })
        .catch(() => console.warn('Uploads still pending after 60s -- some data may not have reached the server.'));
      const finalSig = await stableSignature(page);
      if (finalSig !== lastSig) {
        screens.pop();
        await capture(finalSig);
      }
      finished = true;
      break;
    }
    if (/#\/(error|login)/.test(page.url())) {
      console.error(`Stopped: the app went to ${page.url()} (see last screenshot).`);
      break;
    }

    // Clicking can go on forever on a screen that never moves (e.g. a button
    // that does nothing), so give up on the screen's age, not on idleness --
    // counted from its last visible change (a ticking timer counts), with a
    // hard cap for screens that tick forever.
    const text = await screenText(page);
    if (text !== lastText) {
      lastText = text;
      lastProgress = Date.now();
    }
    const screenAge = Date.now() - screenSince;
    const stuckFor = screenAge > MAX_SCREEN_MS ? Infinity : Date.now() - Math.max(screenSince, lastProgress);
    if (stuckFor <= opts.stuckSec * 1000 || loading) {
      const filled = await fillScreen(page, opts);
      const action = await advance(page, { advanceLabels, screenAgeMs: screenAge, recordMs: opts.recordSec * 1000 });
      if (filled || action) {
        await page.waitForTimeout(POLL_MS);
        continue;
      }
    }

    if (stuckFor > DECLINE_CAMERA_AFTER_MS && (await clickFirst(page, '.btn-decline-camera'))) {
      pendingNote = 'Reached by declining the camera (the export browser has no real camera).';
      screenSince = Date.now();
      continue;
    }
    if (stuckFor > opts.stuckSec * 1000) {
      if (await clickFirst(page, '.btn-skip')) {
        pendingNote = 'Reached by skipping the previous screen (the export script could not complete it).';
        screenSince = Date.now();
        continue;
      }
      console.error(`Stopped: screen "${screens.at(-1)?.title}" didn't change for ${opts.stuckSec}s and has nothing the script knows how to press.`);
      break;
    }
    await page.waitForTimeout(POLL_MS);
  }

  await browser.close();

  const title = opts.title || 'Protocol screens';
  const docxFile = await writeDocx(path.join(outDir, 'protocol-screens.docx'), { title, url: opts.url, screens });
  console.log(`\n${finished ? 'Done' : 'Incomplete'}: ${screens.length} screens -> ${docxFile}`);
  process.exitCode = finished ? 0 : 1;
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
