import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useUser } from "../context/UserContext";
import { fetchSiteById } from "../api/sites";

import StatusBadge from "../components/ProjectDashboard/StatusBadge";
import DashboardTopBar from "../components/DashboardTopBar/DashboardTopBar";
import SiteModal from "../components/SiteManagement/SiteModal";

import "./Pages.css";
import "../components/ProjectDashboard/ProjectDashboard.css";

export default function SiteDashboardPage() {
  const { siteId } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation(["admin", "common"]);
  const { user } = useUser();

  const [site, setSite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // GET /sites/:id returns the site plus its projects and inherited protocols
  const loadData = useCallback(async () => {
    try {
      setSite(await fetchSiteById(siteId));
    } catch (e) {
      console.error("Error loading site dashboard data:", e);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const isMaster = user?.role_id === 1;
  const isReadOnly = site?.is_active === 0;

  if (loading) return <div className="app-container"><p>{t("loading", { ns: "common" })}...</p></div>;

  return (
    <div className={`dashboard-page ${isReadOnly ? "view-only-mode" : ""}`}>
      <DashboardTopBar onBack={() => navigate("/admin")} />

      <div className="page-header">
        <div className="header-top-row">
          <div className="project-title-group">
            <h1 className="page-title">{site?.name || "—"}</h1>
            <StatusBadge active={site?.is_active === 1} />
            {isReadOnly && (
              <div className="inactive-mode-warning">
                ⚠️ {t("projectDashboard.status.inactiveMode")}
              </div>
            )}
          </div>
        </div>

        <div className="project-metadata">
          <div className="metadata-item">
            <span className="metadata-label">{t("projectDashboard.fields.description")}</span>
            <span className="metadata-value">
              {site?.description || t("projectDashboard.noDescription")}
            </span>
          </div>

          <div className="metadata-item">
            <span className="metadata-label">{t("management.siteManagement.table.country")}</span>
            <span className="metadata-value">📍 {site?.country || "—"}</span>
          </div>

          <div className="metadata-item">
            <span className="metadata-label">{t("management.siteManagement.table.contactPersons")}</span>
            <span className="metadata-value">👤 {site?.contact_persons || "—"}</span>
          </div>

          <div className="metadata-item">
            <span className="metadata-label">{t("management.siteManagement.table.contactEmails")}</span>
            <span className="metadata-value">✉️ {site?.contact_emails || "—"}</span>
          </div>
          {isMaster && (
            <button
              className="btn-edit-project"
              onClick={() => !isReadOnly && setIsEditModalOpen(true)}
              disabled={isReadOnly}
              title={t("buttons.edit", { ns: "common" })}
            >
              {t("buttons.edit", { ns: "common" })}
            </button>
          )}
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-card volume-card">
          <h3>{t("projectDashboard.stats.volumeTitle")}</h3>
          <div className="stat-row large">
            <div className="stat-item">
              <span className="stat-value">{site?.projects?.length || 0}</span>
              <span className="stat-label">{t("siteDashboard.stats.projects")}</span>
            </div>
            <div className="stat-divider"></div>
            <div className="stat-item">
              <span className="stat-value">{site?.protocols?.length || 0}</span>
              <span className="stat-label">{t("siteDashboard.stats.protocols")}</span>
            </div>
          </div>
        </div>
      </div>

      <h2 className="section-heading">{t("management.siteManagement.assignedProjects")}</h2>
      <section className="section card">
        {!site?.projects?.length ? (
          <p className="empty-row">{t("management.siteManagement.noAssignedProjects")}</p>
        ) : (
          <div className="table-scroll-area">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("management.projectManagement.table.name")}</th>
                  <th>{t("management.siteManagement.table.status")}</th>
                  <th>{t("management.siteAssignments.table.date")}</th>
                </tr>
              </thead>
              <tbody>
                {site.projects.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => navigate(`/admin/projects/${p.id}`)}
                    style={{ cursor: "pointer" }}
                  >
                    <td className="highlighted">{p.name}</td>
                    <td>{p.is_active ? t("management.status.active") : t("management.status.inactive")}</td>
                    <td>{p.assigned_at ? new Date(p.assigned_at).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {site && isEditModalOpen && (
        <SiteModal
          site={site}
          onClose={() => setIsEditModalOpen(false)}
          onSuccess={loadData}
        />
      )}
    </div>
  );
}
