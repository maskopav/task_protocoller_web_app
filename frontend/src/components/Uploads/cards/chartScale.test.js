import { describe, it, expect } from "vitest";
import { chartBars, CHART, DAY_OPTIONS } from "./chartScale";

const day = (i, count, invalid = 0) => ({ date: `2026-10-${String(i + 1).padStart(2, "0")}`, count, invalid });

describe("chartBars", () => {
  it("never scales below 2 so one upload does not fill the chart", () => {
    const g = chartBars([day(0, 1), day(1, 0)]);
    expect(g.max).toBe(2);
    expect(g.bars[0].h).toBeCloseTo(CHART.height / 2);
    expect(g.bars[1].h).toBe(0);
  });

  it("scales the tallest bar to the full height and the others proportionally", () => {
    const g = chartBars([day(0, 10), day(1, 5), day(2, 0)]);
    expect(g.max).toBe(10);
    expect(g.bars[0].h).toBeCloseTo(CHART.height);
    expect(g.bars[1].h).toBeCloseTo(CHART.height / 2);
    expect(g.bars[0].y).toBeCloseTo(CHART.base - CHART.height);
    expect(g.y(0)).toBe(CHART.base);
  });

  it("marks days with any invalid upload", () => {
    const g = chartBars([day(0, 3, 0), day(1, 3, 1)]);
    expect(g.bars.map((b) => b.invalid)).toEqual([false, true]);
  });

  it("lays bars left to right inside the plot area for every window size", () => {
    for (const n of DAY_OPTIONS) {
      const g = chartBars(Array.from({ length: n }, (_, i) => day(i % 28, i)));
      expect(g.bars).toHaveLength(n);
      expect(g.bars[0].x).toBeGreaterThanOrEqual(CHART.x0);
      const last = g.bars[n - 1];
      expect(last.x + last.w).toBeLessThanOrEqual(CHART.width);
      for (let i = 1; i < n; i++) expect(g.bars[i].x).toBeGreaterThan(g.bars[i - 1].x);
    }
  });

  it("uses unique ticks and copes with no data", () => {
    expect(chartBars([day(0, 1)]).ticks).toEqual([0, 1, 2]);
    expect(chartBars([day(0, 8)]).ticks).toEqual([0, 4, 8]);
    const empty = chartBars([]);
    expect(empty.bars).toEqual([]);
    expect(empty.max).toBe(2);
  });
});
