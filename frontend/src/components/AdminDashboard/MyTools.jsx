// src/components/AdminDashboard/MyTools.jsx
// The non-master counterpart to MasterTools: the same tile row, but showing
// only what this admin was actually granted. Rendering nothing when neither
// right is held keeps the dashboard unchanged for everyone else.
import React from "react";
import { useTranslation } from "react-i18next";
import "./AdminDashboard.css";

export default function MyTools({ canCreateProjects, canCreateSites, onCreateProject, onCreateSite }) {
  const { t } = useTranslation(["admin"]);

  if (!canCreateProjects && !canCreateSites) return null;

  return (
    <section className="dashboard-section master-tools">
      <h2 className="section-heading">
        {t("adminDashboard.myTools.heading")}
      </h2>

      <div className="actions-grid">
        {canCreateProjects && (
          <button className="action-card btn-protocols" onClick={onCreateProject}>
            <div className="icon">📂</div>
            <div className="text">
              <h3>{t("adminDashboard.myTools.newProject")}</h3>
              <p>{t("adminDashboard.myTools.newProjectDesc")}</p>
            </div>
          </button>
        )}

        {canCreateSites && (
          <button className="action-card btn-data" onClick={onCreateSite}>
            <div className="icon">🏥</div>
            <div className="text">
              <h3>{t("adminDashboard.myTools.newSite")}</h3>
              <p>{t("adminDashboard.myTools.newSiteDesc")}</p>
            </div>
          </button>
        )}
      </div>
    </section>
  );
}
