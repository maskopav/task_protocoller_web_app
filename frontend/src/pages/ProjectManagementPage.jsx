// frontend/src/pages/ProjectManagementPage.jsx
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useMappings } from "../context/MappingContext";
import { useUser } from "../context/UserContext";
import DashboardTopBar from "../components/DashboardTopBar/DashboardTopBar";
import ProjectTable from "../components/ProjectManagement/ProjectTable";
import EditProjectModal from "../components/ProjectDashboard/EditProjectModal";
import { updateProjectApi } from "../api/projects"; 


export default function ProjectManagementPage() {
  const { t } = useTranslation(["admin", "common"]);
  const { mappings, refreshMappings } = useMappings();
  const { user } = useUser();
  const navigate = useNavigate();
  const [editingProject, setEditingProject] = useState(null);

  const handleToggleActive = async (projectId, newStatus) => {
    try {
    await updateProjectApi({
        id: projectId,
        is_active: newStatus ? 1 : 0,
        updated_by: user?.id 
        });
      refreshMappings();
    } catch (err) {
      console.error("Update failed:", err);
      alert(t("management.alerts.updateError"));
    }
  };

  return (
    <div className="dashboard-page admin-management-page">
      <DashboardTopBar onBack={() => navigate("/admin")} />

      <div className="page-header">
        <h1 className="page-title">{t("management.projectManagement.title")}</h1> {/* From admin.json */}
        <p className="project-description">
          {t("management.projectManagement.description")} {/* From admin.json */}
        </p>
      </div>
      
      <div className="management-content card">
        <div className="section-header">
          <h3 className="section-title">{t("management.projectManagement.tableTitle")}</h3>
        </div>
        
        <ProjectTable 
          projects={mappings?.projects || []} 
          onEdit={setEditingProject}
          onToggleActive={handleToggleActive}
        />
      </div>

      {editingProject && (
        <EditProjectModal
            open={!!editingProject} 
            project={editingProject}
            onClose={() => setEditingProject(null)}
            onSuccess={() => {
            setEditingProject(null);
            refreshMappings();
            }}
        />
      )}
    </div>
  );
}