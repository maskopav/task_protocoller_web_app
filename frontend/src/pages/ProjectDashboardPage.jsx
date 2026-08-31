import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMappings } from "../context/MappingContext";
import { getProjectStats } from "../api/projects";
import { fetchSites } from "../api/sites";

import ProjectStats from "../components/ProjectDashboard/ProjectStats";
import ProjectActions from "../components/ProjectDashboard/ProjectActions";
import StatusBadge from "../components/ProjectDashboard/StatusBadge";
import DashboardTopBar from "../components/DashboardTopBar/DashboardTopBar"; 
import ProjectModal from "../components/ProjectManagement/ProjectModal";

import "./Pages.css";
import "../components/ProjectDashboard/ProjectDashboard.css";

export default function ProjectDashboardPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation(["admin", "common"]);
  const { refreshMappings, mappings } = useMappings();

  const [stats, setStats] = useState(null);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Define loadData to be used on mount and after successful edit
  const loadData = useCallback(async () => {
    try {
      // Refresh project name/desc from mappings and fetch fresh stats
      await refreshMappings(["projects"]);
      const statsData = await getProjectStats(projectId);
      setStats(statsData);
      setSites(await fetchSites(projectId));
    } catch (e) {
      console.error("Error loading dashboard data:", e);
    } finally {
      setLoading(false);
    }
  }, [projectId, refreshMappings]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const project = mappings?.projects?.find(p => p.id === Number(projectId));
  const isReadOnly = project?.is_active === 0;
  
  if (loading) return <div className="app-container"><p>{t("loading", { ns: "common" })}...</p></div>;

  return (
    <div className={`dashboard-page ${isReadOnly ? "view-only-mode" : ""}`}>
      <DashboardTopBar onBack={() => navigate("/admin")} />

      <div className="page-header">
        {/* Row 1: Title, Badge, and Edit button */}
        <div className="header-top-row">
          <div className="project-title-group">
            <h1 className="page-title">{project?.name || "—"}</h1>
            <StatusBadge active={project?.is_active === 1} />
            {isReadOnly && (
              <div className="inactive-mode-warning">
                ⚠️ {t("projectDashboard.status.inactiveMode")}
              </div>
            )}
          </div>
        
        </div>
        
        {/* Row 2: Metadata Grid including Description */}
        <div className="project-metadata">
          <div className="metadata-item">
            <span className="metadata-label">{t("projectDashboard.fields.description")}</span>
            <span className="metadata-value">
              {project?.description || t("projectDashboard.noDescription")}
            </span>
          </div>

          <div className="metadata-item">
            <span className="metadata-label">{t("projectDashboard.fields.countries")}</span>
            <span className="metadata-value">📍 {project?.countries || "—"}</span>
          </div>

          <div className="metadata-item">
            <span className="metadata-label">{t("projectDashboard.fields.contactPersons")}</span>
            <span className="metadata-value">👤 {project?.contact_persons || "—"}</span>
          </div>

          <div className="metadata-item">
            <span className="metadata-label">{t("projectDashboard.fields.contactEmails")}</span>
            <span className="metadata-value">✉️ {project?.contact_emails || "—"}</span>
          </div>
          <button 
            className="btn-edit-project" 
            onClick={() => !isReadOnly && setIsEditModalOpen(true)}
            disabled={isReadOnly}
            title={t("buttons.edit", { ns: "common" })}
          >
            {t("buttons.edit", { ns: "common" })}
          </button>
        </div>
      </div>

      {/* Stats and Actions now sit higher on the page */}
      <ProjectStats stats={stats} />

      <h2 className="section-heading">{t("projectDashboard.actionsTitle")}</h2>
      <ProjectActions
        onProtocols={() => navigate(`/admin/projects/${projectId}/protocols`)}
      />

      <h2 className="section-heading">{t("projectDashboard.sitesTitle")}</h2>
      <section className="section card">
        {sites.length === 0 ? (
          <p className="empty-row">{t("projectDashboard.noSites")}</p>
        ) : (
          <div className="table-scroll-area">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("management.siteManagement.table.name")}</th>
                  <th>{t("management.siteManagement.table.description")}</th>
                  <th>{t("management.siteManagement.table.status")}</th>
                </tr>
              </thead>
              <tbody>
                {sites.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => navigate(`/admin/sites/${s.id}`)}
                    style={{ cursor: "pointer" }}
                  >
                    <td className="highlighted">{s.name}</td>
                    <td>{s.description}</td>
                    <td>{s.is_active ? t("management.status.active") : t("management.status.inactive")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {project && (
        <ProjectModal 
          open={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          project={project}
          onSuccess={loadData}
        />
      )}
    </div>
  );
}