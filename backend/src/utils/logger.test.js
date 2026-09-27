import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';

const { logFrontendToFile } = await import('./logger.js');

describe('logFrontendToFile', () => {
  let written;
  beforeEach(() => {
    written = '';
    vi.spyOn(fs, 'appendFileSync').mockImplementation((_p, s) => { written += s; });
  });

  it('flattens newlines so a payload cannot forge extra log entries', () => {
    logFrontendToFile({
      level: 'ERROR',
      message: 'boom\n[2026-01-01T00:00:00.000Z] [BACKEND] [INFO] forged',
      url: 'https://x/\r\nforged',
    });
    const lines = written.trim().split('\n');
    expect(lines.filter((l) => l.startsWith('['))).toHaveLength(1);
    expect(written).toContain('boom [2026');
  });

  it('truncates oversized details and coerces unknown levels', () => {
    logFrontendToFile({ level: 'BACKEND] [FATAL', message: 'm', details: 'x'.repeat(10000) });
    expect(written).toContain('[FRONTEND] [INFO] m');
    expect(written).toContain('…[truncated]');
    expect(written.length).toBeLessThan(5000);
  });
});
