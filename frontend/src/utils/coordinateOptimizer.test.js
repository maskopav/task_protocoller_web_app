import { describe, it, expect } from 'vitest';
import { roundCoordinateTimeline, compressJsonToBlob } from './coordinateOptimizer';

describe('roundCoordinateTimeline', () => {
  it('rounds landmark coordinates to the given precision', () => {
    const timeline = [
      {
        timestamp: 123.6,
        landmarks: [{ x: 0.123456, y: 0.987654, z: -0.111111 }],
      },
    ];
    const result = roundCoordinateTimeline(timeline, 4);
    expect(result).toEqual([
      {
        timestamp: 124,
        landmarks: [{ x: 0.1235, y: 0.9877, z: -0.1111 }],
      },
    ]);
  });

  it('defaults to 4 decimal places of precision', () => {
    const timeline = [{ timestamp: 0, landmarks: [{ x: 1 / 3, y: 0, z: 0 }] }];
    const result = roundCoordinateTimeline(timeline);
    expect(result[0].landmarks[0].x).toBe(0.3333);
  });

  it('handles an empty timeline', () => {
    expect(roundCoordinateTimeline([])).toEqual([]);
  });

  it('does not mutate the input', () => {
    const timeline = [{ timestamp: 1.6, landmarks: [{ x: 0.123456, y: 0, z: 0 }] }];
    const snapshot = JSON.parse(JSON.stringify(timeline));
    roundCoordinateTimeline(timeline);
    expect(timeline).toEqual(snapshot);
  });
});

describe('compressJsonToBlob', () => {
  it('produces a gzip-encoded blob when CompressionStream is available', async () => {
    const { blob, encoding } = await compressJsonToBlob({ hello: 'world' });
    expect(encoding).toBe('gzip');
    expect(blob.type).toBe('application/gzip');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('falls back to raw JSON when CompressionStream is unavailable', async () => {
    const original = globalThis.CompressionStream;
    // @ts-expect-error - simulating an unsupported browser
    delete globalThis.CompressionStream;
    try {
      const { blob, encoding } = await compressJsonToBlob({ hello: 'world' });
      expect(encoding).toBeNull();
      expect(blob.type).toBe('application/json');
      expect(await blob.text()).toBe(JSON.stringify({ hello: 'world' }));
    } finally {
      globalThis.CompressionStream = original;
    }
  });
});
