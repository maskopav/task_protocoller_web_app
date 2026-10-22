import { describe, it, expect } from 'vitest';
import { assertBackupName } from './BackupTarget.js';

describe('assertBackupName', () => {
  it.each(['db/20261022-023000.sql.gz', 'sessions/76/76a6.zip', 'a'])('accepts %s', (n) => {
    expect(assertBackupName(n)).toBe(n);
  });
  it.each(['', '/abs', 'a/../b', '..', './a', 'a//b', 'a\\b', 'a b', 'a/'])('rejects %j', (n) => {
    expect(() => assertBackupName(n)).toThrow();
  });
});
