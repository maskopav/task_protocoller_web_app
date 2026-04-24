import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMappings } from "../context/MappingContext";
import { getProjectStats } from "../api/projects";

import ProjectStats from "../components/ProjectDashboard/ProjectStats";
import ProjectActions from "../components/ProjectDashboard/ProjectActions";
import StatusBadge from "../components/ProjectDashboard/StatusBadge";
import DashboardTopBar from "../components/DashboardTopBar/DashboardTopBar"; 
import EditProjectModal from "../components/ProjectDashboard/EditProjectModal";

import "./Pages.css";
import "../components/ProjectDashboard/ProjectDashboard.css";

export default function ProjectDashboardPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation(["admin", "common"]);
  const { refreshMappings, mappings } = useMappings();

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Define loadData to be used on mount and after successful edit
  const loadData = useCallback(async () => {
    try {
      // Refresh project name/desc from mappings and fetch fresh stats
      await refreshMappings(["projects"]);
      const statsData = await getProjectStats(projectId);
      setStats(statsData);
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
            <span className="metadata-label">{t("projectDashboard.fields.country")}</span>
            <span className="metadata-value">📍 {project?.country || "—"}</span>
          </div>

          <div className="metadata-item">
            <span className="metadata-label">{t("projectDashboard.fields.frequency")}</span>
            <span className="metadata-value">⏱️ {project?.frequency || "—"}</span>
          </div>

          <div className="metadata-item">
            <span className="metadata-label">{t("projectDashboard.fields.contact")}</span>
            <span className="metadata-value">👤 {project?.contact_person || "—"}</span>
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
        onParticipants={() => navigate(`/admin/projects/${projectId}/participants`)}
        onProtocols={() => navigate(`/admin/projects/${projectId}/protocols`)}
        onData={() => navigate(`/admin/projects/${projectId}/fieldwork`)}
      />

      {project && (
        <EditProjectModal 
          open={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          project={project}
          onSuccess={loadData}
        />
      )}
    </div>
  );
}