import React from "react";
import { useTranslation } from "react-i18next";
import StatusBadge from "../ProjectDashboard/StatusBadge";
import "./AdminDashboard.css";

export default function ProjectGrid({ projects, onProjectClick }) {
  const { t } = useTranslation(["admin"]);
  
  return (
    <section className="dashboard-section">
      <h2 className="section-heading">{t("adminDashboard.projectsTitle")}</h2>
      <div className="project-grid">
        {projects.map(project => (
          <div 
            key={project.project_id} 
            className="project-card action-card" 
            onClick={() => onProjectClick(project.project_id)}
          >
            <div className="project-card-header">
              <h3>{project.project_name}</h3>
              <StatusBadge active={project.project_is_active === 1} />
            </div>
            <div className="project-card-body">
              <p>{project.country} • {project.frequency}</p>
              <p className="project-descr">{project.description}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}