import { describe, it, expect, vi, beforeEach } from 'vitest';

const conns = [];
vi.mock('./connection.js', () => ({
  default: { getConnection: vi.fn(async () => conns.shift()) },
}));
const { executeTransaction } = await import('./queryHelper.js');

const fakeConn = () => ({
  beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), query: vi.fn(),
});
const err = (code) => Object.assign(new Error(code), { code });

describe('executeTransaction', () => {
  beforeEach(() => { conns.length = 0; });

  it('commits and returns the callback result', async () => {
    const c = fakeConn(); conns.push(c);
    await expect(executeTransaction(async () => 7)).resolves.toBe(7);
    expect(c.commit).toHaveBeenCalled();
    expect(c.release).toHaveBeenCalled();
  });

  it('does not retry by default', async () => {
    const c = fakeConn(); conns.push(c);
    const cb = vi.fn().mockRejectedValue(err('ER_CHECKREAD'));
    await expect(executeTransaction(cb)).rejects.toThrow('ER_CHECKREAD');
    expect(cb).toHaveBeenCalledTimes(1);
    expect(c.rollback).toHaveBeenCalled();
  });

  it('reruns the callback on a transient lock conflict when asked', async () => {
    const a = fakeConn(); const b = fakeConn(); conns.push(a, b);
    const cb = vi.fn().mockRejectedValueOnce(err('ER_CHECKREAD')).mockResolvedValueOnce('ok');
    await expect(executeTransaction(cb, { retries: 2 })).resolves.toBe('ok');
    expect(cb).toHaveBeenCalledTimes(2);
    expect(a.rollback).toHaveBeenCalled();
    expect(b.commit).toHaveBeenCalled();
    expect(a.release).toHaveBeenCalled();
    expect(b.release).toHaveBeenCalled();
  });

  it('gives up after the retries and never retries other errors', async () => {
    conns.push(fakeConn(), fakeConn(), fakeConn());
    const deadlock = vi.fn().mockRejectedValue(err('ER_LOCK_DEADLOCK'));
    await expect(executeTransaction(deadlock, { retries: 2 })).rejects.toThrow('ER_LOCK_DEADLOCK');
    expect(deadlock).toHaveBeenCalledTimes(3);

    conns.push(fakeConn());
    const dup = vi.fn().mockRejectedValue(err('ER_DUP_ENTRY'));
    await expect(executeTransaction(dup, { retries: 2 })).rejects.toThrow('ER_DUP_ENTRY');
    expect(dup).toHaveBeenCalledTimes(1);
  });
});
