// Pure geometry for the uploads-per-day chart (viewBox 296x76), kept apart from
// the component so the scaling is unit-testable.
export const DAY_OPTIONS = [7, 14, 21, 30, 60, 90];

export const CHART = { width: 296, x0: 16, base: 62, height: 56 };

/**
 * perDay: [{date, count, invalid}] oldest first (one entry per day, as the
 * summary endpoint returns it). The y-axis never drops below 2 so a single
 * upload doesn't fill the chart.
 */
export function chartBars(perDay = [], { width, x0, base, height } = CHART) {
  const max = Math.max(2, ...perDay.map((d) => d.count || 0));
  const step = (width - x0) / Math.max(1, perDay.length);
  const y = (v) => base - (v / max) * height;
  const bars = perDay.map((d, i) => {
    const h = ((d.count || 0) / max) * height;
    return {
      date: d.date,
      count: d.count || 0,
      invalid: (d.invalid || 0) > 0,
      x: x0 + i * step + step * 0.15,
      w: step * 0.7,
      h,
      y: base - h,
      r: Math.min(2, step * 0.2),
    };
  });
  const ticks = [...new Set([0, Math.round(max / 2), max])];
  return { max, step, y, bars, ticks };
}
