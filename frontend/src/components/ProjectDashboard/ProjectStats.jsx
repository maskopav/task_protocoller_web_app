// src/components/ProjectDashboard/ProjectStats.jsx
import React from "react";
import { useTranslation } from "react-i18next";
import "./ProjectDashboard.css";

// `extra`: optional stat items appended to the row (the upload numbers).
export default function ProjectStats({ stats, extra = null }) {
  const { t } = useTranslation(["admin"]);

  return (
    <div className="dashboard-grid">
      <div className="dashboard-card volume-card">
        <h3>{t("projectDashboard.stats.volumeTitle")}</h3>
        <div className="stat-row large">
          <div className="stat-item">
            <span className="stat-value">{stats?.count_current_protocols_defined || 0}</span>
            <span className="stat-label">{t("projectDashboard.stats.protocols")}</span>
          </div>
          <div className="stat-divider"></div>
          <div className="stat-item">
            <span className="stat-value">{stats?.count_sites || 0}</span>
            <span className="stat-label">{t("projectDashboard.stats.sites")}</span>
          </div>
          {extra}
        </div>
      </div>
    </div>
  );
}