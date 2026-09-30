import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { logger, setLogContext, clearLogContext } from './frontendLogger';

// Runs under the node environment: stub the browser globals sendLog reads.
let fetchMock;

beforeEach(() => {
  fetchMock = vi.fn(async () => ({ ok: true }));
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('navigator', { userAgent: 'test-agent' });
  vi.stubGlobal('window', { location: { href: 'http://app/participant/interface' } });
  clearLogContext();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const sentPayload = () => JSON.parse(fetchMock.mock.calls[0][1].body);

describe('frontendLogger', () => {
  it('attaches the current log context to every entry', async () => {
    setLogContext({ sessionId: 452, taskIndex: 3 });
    await logger.info('recording_finalized', { sampleRate: 48000 });

    const payload = sentPayload();
    expect(payload.context).toEqual({ sessionId: 452, taskIndex: 3 });
    expect(payload.details).toEqual({ sampleRate: 48000 });
  });

  it('merges context updates and removes keys set to undefined', async () => {
    setLogContext({ sessionId: 452, taskIndex: 3, protocolTaskId: 9 });
    setLogContext({ taskIndex: 4, protocolTaskId: undefined });
    await logger.info('x');

    expect(sentPayload().context).toEqual({ sessionId: 452, taskIndex: 4 });
  });

  it('sends null context when none is set', async () => {
    await logger.info('x');
    expect(sentPayload().context).toBeNull();
  });

  it('keeps the extra argument next to a serialized Error', async () => {
    const err = new Error('boom');
    await logger.error('Background upload failed', err, { recordingId: 'rec1' });

    const { details } = sentPayload();
    expect(details).toMatchObject({ name: 'Error', message: 'boom', recordingId: 'rec1' });
    expect(details.stack).toEqual(expect.any(String));
  });

  it('keeps a primitive details value when extra is given', async () => {
    await logger.warn('x', 'plain string', { a: 1 });
    expect(sentPayload().details).toEqual({ value: 'plain string', a: 1 });
  });

  it('never throws when the log request fails', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(logger.info('x')).resolves.toBeUndefined();
    consoleError.mockRestore();
  });
});
