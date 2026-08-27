// src/components/ProjectDashboard/ProjectActions.jsx
import React from "react";
import { useTranslation } from "react-i18next";
import "./ProjectDashboard.css";

export default function ProjectActions({ onProtocols }) {
  const { t } = useTranslation(["admin"]);

  return (
    <div className="actions-grid">
      <button className="action-card btn-protocols" onClick={onProtocols}>
        <div className="icon">📋</div>
        <div className="text">
          <h3>{t("projectDashboard.actions.protocols")}</h3>
          <p>{t("projectDashboard.actions.protocolsDesc")}</p>
        </div>
      </button>
    </div>
  );
}