import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { dateInYyyyMmDdHhMmSs, localDateTimeString, localDateString, utcDbToLocal } from './dateFormatter';

describe('dateInYyyyMmDdHhMmSs', () => {
  it('formats a date as YYYY-MM-DD_HH-MM-SSZ in UTC', () => {
    const date = new Date(Date.UTC(2026, 0, 5, 8, 3, 9)); // Jan 5 2026, 08:03:09 UTC
    expect(dateInYyyyMmDdHhMmSs(date)).toBe('2026-01-05_08-03-09Z');
  });

  it('zero-pads single-digit month, day, hour, minute, second', () => {
    const date = new Date(Date.UTC(2026, 8, 4, 1, 2, 3)); // Sep 4 2026, 01:02:03 UTC
    expect(dateInYyyyMmDdHhMmSs(date)).toBe('2026-09-04_01-02-03Z');
  });

  it('supports a custom date divider', () => {
    const date = new Date(Date.UTC(2026, 0, 5, 8, 3, 9));
    expect(dateInYyyyMmDdHhMmSs(date, '/')).toBe('2026/01/05_08-03-09Z');
  });

  it('defaults to the current date/time when no date is given', () => {
    const result = dateInYyyyMmDdHhMmSs();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}Z$/);
    expect(result.slice(0, 4)).toBe(String(new Date().getUTCFullYear()));
  });
});

// The local-time helpers use the process time zone; pin it so these run the
// same on any machine (Node picks up a runtime TZ change).
describe('local-time helpers (TZ=Europe/Prague)', () => {
  let originalTz;
  beforeAll(() => { originalTz = process.env.TZ; process.env.TZ = 'Europe/Prague'; });
  afterAll(() => { if (originalTz === undefined) delete process.env.TZ; else process.env.TZ = originalTz; });

  it('utcDbToLocal converts a UTC DB value to local time (summer, +2h)', () => {
    expect(utcDbToLocal('2026-08-31 13:38:47')).toBe('2026-08-31 15:38:47');
  });

  it('utcDbToLocal uses the winter offset (+1h) and handles fractional seconds', () => {
    expect(utcDbToLocal('2026-01-05 08:03:09.123')).toBe('2026-01-05 09:03:09');
  });

  it('utcDbToLocal leaves empty values empty and bad values untouched', () => {
    expect(utcDbToLocal(null)).toBe('');
    expect(utcDbToLocal('nonsense')).toBe('nonsense');
  });

  it('localDateString gives the local calendar day, not the UTC one', () => {
    // 23:30 UTC on Sep 1 is already Sep 2 in Prague.
    expect(localDateString(new Date(Date.UTC(2026, 8, 1, 23, 30)))).toBe('2026-09-02');
  });

  it('localDateTimeString formats local components', () => {
    expect(localDateTimeString(new Date(Date.UTC(2026, 8, 1, 23, 30, 5)))).toBe('2026-09-02 01:30:05');
  });
});
