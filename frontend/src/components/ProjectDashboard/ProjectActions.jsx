// src/components/ProjectDashboard/ProjectActions.jsx
import React from "react";
import { useTranslation } from "react-i18next";
import "./ProjectDashboard.css";

export default function ProjectActions({ onParticipants, onProtocols, onData }) {
  const { t } = useTranslation(["admin"]);

  return (
    <div className="actions-grid">
      <button className="action-card btn-participants" onClick={onParticipants}>
        <div className="icon">👥</div>
        <div className="text">
          <h3>{t("projectDashboard.actions.participants")}</h3>
          <p>{t("projectDashboard.actions.participantsDesc")}</p>
        </div>
      </button>

      <button className="action-card btn-protocols" onClick={onProtocols}>
        <div className="icon">📋</div>
        <div className="text">
          <h3>{t("projectDashboard.actions.protocols")}</h3>
          <p>{t("projectDashboard.actions.protocolsDesc")}</p>
        </div>
      </button>

      <button className="action-card btn-data" onClick={onData}>
        <div className="icon">📊</div>
        <div className="text">
          <h3>{t("projectDashboard.actions.fieldwork")}</h3>
          <p>{t("projectDashboard.actions.fieldworkDesc")}</p>
        </div>
      </button>
    </div>
  );
}