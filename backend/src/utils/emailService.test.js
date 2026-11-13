import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendMail = vi.fn();
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail }) } }));
vi.mock('./logger.js', () => ({ logToFile: vi.fn(), logFrontendToFile: vi.fn() }));

const { sendAdminWelcomeEmail } = await import('./emailService.js');

const LINK = 'https://malenia.example/koubic/api/version/download/latest/install-windows-x64.zip';
const base = { fullName: 'Ann', tempPassword: 'tmp-pw', loginLink: 'http://internal:10001' };

beforeEach(() => { sendMail.mockReset().mockResolvedValue({}); });

describe('sendAdminWelcomeEmail', () => {
  it('adds the Windows desktop app row when a download link is given', async () => {
    expect(await sendAdminWelcomeEmail('ann@x.cz', { ...base, appDownloadLink: LINK }, 'en')).toBe(true);
    const { html, to } = sendMail.mock.calls[0][0];
    expect(to).toBe('ann@x.cz');
    expect(html).toContain('Desktop app (Windows)');
    expect(html).toContain(`<a href="${LINK}">${LINK}</a>`);
    expect(html).toContain('tmp-pw');
  });

  it('translates the row label', async () => {
    await sendAdminWelcomeEmail('ann@x.cz', { ...base, appDownloadLink: LINK }, 'cs');
    expect(sendMail.mock.calls[0][0].html).toContain('Desktopová aplikace (Windows)');
    await sendAdminWelcomeEmail('ann@x.cz', { ...base, appDownloadLink: LINK }, 'de');
    expect(sendMail.mock.calls[1][0].html).toContain('Desktop-App (Windows)');
  });

  it('leaves the row out without a link, and still sends', async () => {
    expect(await sendAdminWelcomeEmail('ann@x.cz', base, 'en')).toBe(true);
    const { html } = sendMail.mock.calls[0][0];
    expect(html).not.toContain('Desktop app');
    expect(html).not.toContain('/api/version/download');
    expect(html).toContain('http://internal:10001');
  });
});
