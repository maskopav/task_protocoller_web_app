import React from "react";
import useUploadLabels from "../useUploadLabels";
import { fmtDate } from "../format";
import { chartBars, CHART, DAY_OPTIONS } from "./chartScale";
import "./UploadCards.css";

/** Plain-SVG bars, one per day; a day with any invalid upload is red. */
export default function UploadsPerDayChart({ summary, days, onDaysChange }) {
  const { t } = useUploadLabels();
  const perDay = summary?.data?.perDay;
  const shown = summary?.data?.days ?? days;
  const g = perDay ? chartBars(perDay) : null;
  return (
    <div className="um-panel" data-testid="per-day-chart">
      <div className="um-section-head">
        <span className="um-label">{t("cards.perDay.title")}</span>
        <select className="um-mini-select" aria-label={t("cards.perDay.daysShown")} value={days} onChange={(e) => onDaysChange(Number(e.target.value))}>
          {DAY_OPTIONS.map((o) => <option key={o} value={o}>{t("cards.perDay.lastDays", { count: o })}</option>)}
        </select>
      </div>
      {summary?.status === "error" ? (
        <span className="um-quiet" role="status">{t("cards.unavailable")}</span>
      ) : !g ? (
        <span className="um-muted">…</span>
      ) : (
        <svg viewBox="0 0 296 76" role="img" aria-label={t("cards.perDay.aria", { count: shown })} style={{ width: "100%", height: "auto" }}>
          {g.ticks.map((tick) => (
            <g key={tick}>
              <line x1={CHART.x0} y1={g.y(tick) + 0.5} x2={CHART.width} y2={g.y(tick) + 0.5} stroke="var(--row-border)" strokeDasharray={tick ? "2 2" : undefined} />
              <text x={CHART.x0 - 3} y={g.y(tick) + 3} fontSize="8" fill="var(--dark-gray)" textAnchor="end">{tick}</text>
            </g>
          ))}
          {g.bars.map((b) => (
            <rect key={b.date} data-testid="bar" data-invalid={b.invalid ? "1" : "0"} x={b.x} y={b.y} width={b.w} height={b.h} rx={b.r} fill={b.invalid ? "var(--danger)" : "var(--primary)"}>
              <title>{t("cards.perDay.bar", { date: b.date, count: b.count })}</title>
            </rect>
          ))}
          <text x={CHART.x0} y="74" fontSize="8" fill="var(--dark-gray)">{fmtDate(`${perDay[0]?.date}T12:00:00`)}</text>
          <text x={CHART.width} y="74" fontSize="8" fill="var(--dark-gray)" textAnchor="end">{t("cards.perDay.today")}</text>
        </svg>
      )}
    </div>
  );
}
