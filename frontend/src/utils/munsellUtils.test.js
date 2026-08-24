import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadAndComputeD15Colors } from './munsellUtils';

const D15_HUES = [
  '10B', '5B', '10BG', '5BG', '10G', '5G', '10GY', '5GY',
  '5Y', '10YR', '2.5YR', '7.5R', '2.5R', '5RP', '10P', '5P',
];

// Minimal well-formed rows: hue V C x y Y, for V=8 C=2 (the default target).
const makeDatFile = (hues = D15_HUES) => {
  const header = 'h  V  C  x  y  Y\n';
  const rows = hues
    .map((h) => `${h} 8 2 0.31 0.32 30.0`)
    .join('\n');
  return header + rows;
};

describe('loadAndComputeD15Colors', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns one CSS rgb() color per D15 hue, in Farnsworth order', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(makeDatFile()),
    }));

    const colors = await loadAndComputeD15Colors();
    expect(colors).toHaveLength(D15_HUES.length);
    colors.forEach((c) => expect(c).toMatch(/^rgb\(/));
  });

  it('returns a fallback gray for a hue missing from the data file', async () => {
    const huesWithoutFirst = D15_HUES.slice(1);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(makeDatFile(huesWithoutFirst)),
    }));

    const colors = await loadAndComputeD15Colors();
    expect(colors[0]).toBe('#CCCCCC');
    expect(colors).toHaveLength(D15_HUES.length);
  });

  it('returns an empty array when the fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    const colors = await loadAndComputeD15Colors();
    expect(colors).toEqual([]);
  });

  it('ignores rows for a different Value/Chroma than requested', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(`h V C x y Y\n10B 5 1 0.31 0.32 30.0\n`),
    }));

    const colors = await loadAndComputeD15Colors('/realColor.dat', 8, 2);
    expect(colors[0]).toBe('#CCCCCC'); // no V=8/C=2 row for 10B
  });
});
