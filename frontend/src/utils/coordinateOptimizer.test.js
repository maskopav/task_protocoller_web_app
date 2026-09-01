import { describe, it, expect } from 'vitest';
import { roundCoordinateTimeline, compressJsonToBlob, transposeCoordinateTimeline } from './coordinateOptimizer';

describe('roundCoordinateTimeline', () => {
  it('rounds landmark coordinates to the given precision and flattens them', () => {
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
        landmarks: [0.1235, 0.9877, -0.1111],
      },
    ]);
  });

  it('defaults to 4 decimal places of precision', () => {
    const timeline = [{ timestamp: 0, landmarks: [{ x: 1 / 3, y: 0, z: 0 }] }];
    const result = roundCoordinateTimeline(timeline);
    expect(result[0].landmarks[0]).toBe(0.3333);
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

describe('transposeCoordinateTimeline', () => {
  it('groups each landmark\'s values contiguously across frames', () => {
    const rounded = roundCoordinateTimeline([
      { timestamp: 0, landmarks: [{ x: 0.1, y: 0.2, z: 0.3 }, { x: 0.4, y: 0.5, z: 0.6 }] },
      { timestamp: 33, landmarks: [{ x: 0.11, y: 0.21, z: 0.31 }, { x: 0.41, y: 0.51, z: 0.61 }] },
    ]);
    const result = transposeCoordinateTimeline(rounded);
    expect(result.format).toBe('transposed-v1');
    expect(result.frameCount).toBe(2);
    expect(result.landmarkCount).toBe(2);
    expect(result.timestamps).toEqual([0, 33]);
    // landmark 0 across both frames, then landmark 1 across both frames
    expect(result.x).toEqual([0.1, 0.11, 0.4, 0.41]);
    expect(result.y).toEqual([0.2, 0.21, 0.5, 0.51]);
    expect(result.z).toEqual([0.3, 0.31, 0.6, 0.61]);
  });

  it('returns an empty-but-valid shape for an empty timeline', () => {
    expect(transposeCoordinateTimeline([])).toEqual({
      format: 'transposed-v1', frameCount: 0, landmarkCount: 0, timestamps: [], x: [], y: [], z: [],
    });
  });

  it('returns null when frames disagree on landmark count', () => {
    const rounded = roundCoordinateTimeline([
      { timestamp: 0, landmarks: [{ x: 0.1, y: 0.2, z: 0.3 }, { x: 0.4, y: 0.5, z: 0.6 }] },
      { timestamp: 33, landmarks: [{ x: 0.11, y: 0.21, z: 0.31 }] },
    ]);
    expect(transposeCoordinateTimeline(rounded)).toBeNull();
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
