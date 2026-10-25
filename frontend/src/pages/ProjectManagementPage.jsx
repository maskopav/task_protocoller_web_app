// frontend/src/pages/ProjectManagementPage.jsx
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMappings } from "../context/MappingContext";
import ProjectTable from "../components/ProjectManagement/ProjectTable";
import ProjectModal from "../components/ProjectManagement/ProjectModal";
import { updateProject } from "../api/projects";
import "./Pages.css";

export default function ProjectManagementPage() {
  const { t } = useTranslation(["admin", "common"]);
  const { mappings, refreshMappings } = useMappings();
  const [editingProject, setEditingProject] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const handleToggleActive = async (projectId, newStatus) => {
    try {
      await updateProject(projectId, { is_active: !!newStatus });
      refreshMappings();
    } catch (err) {
      console.error("Update failed:", err);
      alert(t("management.alerts.updateError"));
    }
  };

  return (
    <div className="dashboard-page">

      <div className="page-header">
        <h1 className="page-title">{t("management.projectManagement.title")}</h1> {/* From admin.json */}
        <p className="project-description">
          {t("management.projectManagement.description")} {/* From admin.json */}
        </p>
      </div>
      
      <div className="management-sections">
        <ProjectTable 
          projects={mappings?.projects || []} 
          onEdit={setEditingProject}
          onToggleActive={handleToggleActive}
          onAddClick={() => setShowAddModal(true)}
        />
      </div>

      <ProjectModal 
        open={showAddModal} 
        onClose={() => setShowAddModal(false)} 
        onSuccess={() => { refreshMappings(); }} 
      />

      {editingProject && (
        <ProjectModal
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