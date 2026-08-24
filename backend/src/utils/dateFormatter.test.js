import { describe, it, expect } from 'vitest';
import { dateInYyyyMmDdHhMmSs } from './dateFormatter';

describe('dateInYyyyMmDdHhMmSs', () => {
  it('formats a date as YYYY-MM-DD_HH-MM-SS in UTC', () => {
    const date = new Date(Date.UTC(2026, 0, 5, 8, 3, 9)); // Jan 5 2026, 08:03:09 UTC
    expect(dateInYyyyMmDdHhMmSs(date)).toBe('2026-01-05_08-03-09');
  });

  it('zero-pads single-digit month, day, hour, minute, second', () => {
    const date = new Date(Date.UTC(2026, 8, 4, 1, 2, 3)); // Sep 4 2026, 01:02:03 UTC
    expect(dateInYyyyMmDdHhMmSs(date)).toBe('2026-09-04_01-02-03');
  });

  it('supports a custom date divider', () => {
    const date = new Date(Date.UTC(2026, 0, 5, 8, 3, 9));
    expect(dateInYyyyMmDdHhMmSs(date, '/')).toBe('2026/01/05_08-03-09');
  });

  it('defaults to the current date/time when no date is given', () => {
    const result = dateInYyyyMmDdHhMmSs();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
    expect(result.slice(0, 4)).toBe(String(new Date().getUTCFullYear()));
  });
});
