// src/components/SmellTestTask/ScentCard.jsx
import React from "react";
import { useTranslation } from "react-i18next";

// Simplified drawing of the physical scent card: one numbered spot per scent,
// joined by a dotted path in the order the participant goes through them.
// Smelled spots get a check; a ring slides along to the current one.
//
// Spot positions are [column, row] in scent order, matching the printed card:
// down the left edge, along the bottom, up the right edge.
const CARD_LAYOUTS = {
  5: { cols: 3, rows: 2, spots: [[0, 0], [0, 1], [1, 1], [2, 1], [2, 0]] },
  // Rows closer together so the taller card isn't scaled down as much
  8: { cols: 4, rows: 3, cellH: 80, spots: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [3, 2], [3, 1], [3, 0]] },
};
// Any other count: a single row, left to right
const rowLayout = (n) => ({ cols: n, rows: 1, spots: Array.from({ length: n }, (_, i) => [i, 0]) });

const CELL_W = 120;
const PAD = 14;
const R = 30; // spot radius
const R_CURRENT = 40;

export default function ScentCard({ count, current }) {
  const { t } = useTranslation("tasks");
  if (count < 2) return null;

  const { cols, rows, spots, cellH = 100 } = CARD_LAYOUTS[count] || rowLayout(count);
  const width = cols * CELL_W + 2 * PAD;
  const height = rows * cellH + 2 * PAD;
  const points = spots.map(([c, r]) => [PAD + (c + 0.5) * CELL_W, PAD + (r + 0.5) * cellH]);
  const path = (pts) => pts.map((p) => p.join(",")).join(" ");
  const [cx, cy] = points[current];

  return (
    <svg
      className="scent-card"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={t("smell.card.progress", {
        current: current + 1,
        total: count,
        defaultValue: "Scent {{current}} of {{total}}",
      })}
    >
      <rect className="scent-card-bg" x="2" y="2" width={width - 4} height={height - 4} rx="22" />
      <polyline className="scent-card-path" points={path(points)} />
      <polyline className="scent-card-path is-done" points={path(points.slice(0, current + 1))} />

      {/* Free middle of the card (U-shaped layouts only) */}
      {rows > 1 && (
        <text
          className="scent-card-label"
          x={PAD + (cols / 2) * CELL_W}
          y={PAD + ((rows - 1) / 2) * cellH}
          aria-hidden="true"
        >
          <tspan x={PAD + (cols / 2) * CELL_W} dy="-0.1em">{t("smell.card.scent", { defaultValue: "Scent" })}</tspan>
          <tspan className="scent-card-label-count" x={PAD + (cols / 2) * CELL_W} dy="1.25em">
            {current + 1} / {count}
          </tspan>
        </text>
      )}

      {points.map(([x, y], i) => {
        const state = i < current ? "is-done" : i === current ? "is-current" : "is-next";
        return (
          <g key={i} className={`scent-card-spot ${state}`} aria-hidden="true">
            <circle cx={x} cy={y} r={i === current ? R_CURRENT : R} />
            {i < current ? (
              <path d={`M${x - 13} ${y + 1} l9 9 l17 -19`} className="scent-card-check" />
            ) : (
              <text x={x} y={y}>{i + 1}</text>
            )}
          </g>
        );
      })}

      {/* Moves from spot to spot (CSS transition on transform) */}
      <circle
        className="scent-card-cursor"
        r={R_CURRENT + 8}
        style={{ transform: `translate(${cx}px, ${cy}px)` }}
        aria-hidden="true"
      />
    </svg>
  );
}
