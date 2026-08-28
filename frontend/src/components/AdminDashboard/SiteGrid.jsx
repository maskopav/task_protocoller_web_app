import React from "react";
import { useTranslation } from "react-i18next";
import StatusBadge from "../ProjectDashboard/StatusBadge";
import "./AdminDashboard.css";

export default function SiteGrid({ sites, onSiteClick }) {
  const { t } = useTranslation(["admin"]);

  return (
    <section className="dashboard-section">
      <h2 className="section-heading">{t("adminDashboard.sitesTitle")}</h2>
      <div className="project-grid">
        {sites.map(site => (
          <div
            key={site.id}
            className="project-card action-card"
            onClick={() => onSiteClick(site.id)}
          >
            <div className="project-card-header">
              <h3>{site.name}</h3>
              <StatusBadge active={site.is_active === 1} />
            </div>
            <div className="project-card-body">
              <p>{site.project_count} {t("siteDashboard.stats.projects")}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
