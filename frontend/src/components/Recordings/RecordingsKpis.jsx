import React from "react";
import { useTranslation } from "react-i18next";
import { StatusDot } from "../ui/StatusDot.jsx";
import { kpiCards } from "./recordingsQuery";
import "./recordings.css";

/** Unreviewed / Needs attention / Invalid / Received in 7 days. A card toggles its filter. */
export default function RecordingsKpis({ list }) {
  const { t } = useTranslation("uploads");
  const cards = kpiCards(list.f, list.data?.kpis);
  return (
    <div className="rec-kpis" data-testid="recordings-kpis">
      {cards.map((c) => (
        <button
          key={c.key}
          type="button"
          className="rec-kpi"
          aria-pressed={c.on}
          data-testid={`recordings-kpi-${c.key}`}
          onClick={() => list.update(c.patch)}
        >
          <span className="rec-kpi-label"><StatusDot tone={c.tone}>{t(`recordings.kpi.${c.key}`)}</StatusDot></span>
          <span className="rec-kpi-value">{c.value ?? "–"}</span>
        </button>
      ))}
    </div>
  );
}
