import { describe, it, expect } from 'vitest';

// createPool does not connect until the first query, so importing is safe.
const pool = (await import('./connection.js')).default;

describe('db pool config', () => {
  const cfg = pool.pool.config.connectionConfig;

  it('binds objects as strings, so req.body objects cannot expand to `key` = val', () => {
    expect(cfg.stringifyObjects).toBe(true);
  });

  it('does not allow stacked statements', () => {
    expect(cfg.multipleStatements).toBe(false);
  });
});
