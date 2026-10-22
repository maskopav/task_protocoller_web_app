import { describe, it, expect } from 'vitest';
import {
  blockedReason, isBulkSelectable, checkBundleLimits, filterRows,
  MAX_BUNDLE_SESSIONS, MAX_BUNDLE_BYTES,
} from './selection';

const row = (o = {}) => ({ id: 'a', canEdit: true, status: 'valid', qc: 'unreviewed', issues: [], bytes: 10, protocol: 'P1', ...o });

describe('blockedReason', () => {
  it('allows editable valid rows', () => expect(blockedReason(row())).toBeNull());
  it('blocks read-only rows', () => expect(blockedReason(row({ canEdit: false }))).toBe('readOnly'));
  it('blocks validating rows', () => expect(blockedReason(row({ status: 'validating' }))).toBe('validating'));
  it('does not block invalid rows', () => expect(blockedReason(row({ status: 'invalid' }))).toBeNull());
});

describe('isBulkSelectable', () => {
  it('skips invalid rows', () => expect(isBulkSelectable(row({ status: 'invalid' }))).toBe(false));
  it('skips blocked rows', () => expect(isBulkSelectable(row({ canEdit: false }))).toBe(false));
  it('accepts valid rows', () => expect(isBulkSelectable(row())).toBe(true));
});

describe('checkBundleLimits', () => {
  it('passes at the limits', () => {
    const rows = Array.from({ length: MAX_BUNDLE_SESSIONS }, (_, i) => row({ bytes: i === 0 ? MAX_BUNDLE_BYTES : 0 }));
    expect(checkBundleLimits(rows).ok).toBe(true);
  });
  it('refuses more than 200 sessions', () => {
    const rows = Array.from({ length: MAX_BUNDLE_SESSIONS + 1 }, () => row());
    expect(checkBundleLimits(rows)).toMatchObject({ ok: false, reason: 'tooMany' });
  });
  it('refuses more than 5 GB', () => {
    expect(checkBundleLimits([row({ bytes: MAX_BUNDLE_BYTES }), row({ bytes: 1 })])).toMatchObject({ ok: false, reason: 'tooLarge' });
  });
  it('sums bytes', () => expect(checkBundleLimits([row({ bytes: 5 }), row({ bytes: 7 })]).bytes).toBe(12));
});

describe('filterRows', () => {
  const f = { hideBad: true, qc: '', protocol: '', excludeFlags: new Set() };
  const rows = [row({ id: 1 }), row({ id: 2, qc: 'excluded' }), row({ id: 3, status: 'invalid' }), row({ id: 4, issues: ['late'] }), row({ id: 5, protocol: 'P2' })];
  it('hides excluded and invalid by default', () => expect(filterRows(rows, f).map((r) => r.id)).toEqual([1, 4, 5]));
  it('shows them when asked', () => expect(filterRows(rows, { ...f, hideBad: false })).toHaveLength(5));
  it('excludes flagged rows', () => expect(filterRows(rows, { ...f, excludeFlags: new Set(['late']) }).map((r) => r.id)).toEqual([1, 5]));
  it('filters by protocol and review', () => {
    expect(filterRows(rows, { ...f, protocol: 'P2' }).map((r) => r.id)).toEqual([5]);
    expect(filterRows(rows, { ...f, hideBad: false, qc: 'excluded' }).map((r) => r.id)).toEqual([2]);
  });
});
