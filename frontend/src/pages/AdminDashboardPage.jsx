import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getMappings } from "../api/mappings";
import { useUser } from "../context/UserContext";
import { fetchProjectsList } from "../api/projects";

// Shared & Local Components
import DashboardTopBar from "../components/DashboardTopBar/DashboardTopBar";
import ProjectGrid from "../components/AdminDashboard/ProjectGrid";
import MasterTools from "../components/AdminDashboard/MasterTools";

import "./Pages.css";

export default function AdminDashboardPage() {
  const { t } = useTranslation(["admin", "common"]);
  const navigate = useNavigate();
  const { user } = useUser();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }

    if (user) {
      // Scoping (master vs. assigned-projects-only) is resolved server-side
      // from the admin's own JWT — see api/projects.js.
      fetchProjectsList()
        .then(setProjects)
        .catch(err => console.error(err))
        .finally(() => setLoading(false));
    }
  }, [user, navigate]);

  const handleLogout = () => {
    localStorage.removeItem("adminUser");
    navigate("/login");
  };

  if (loading) return <div className="app-container"><p>{t("loading", {ns: "common"})}...</p></div>;

  return (
    <div className="dashboard-page">
      <DashboardTopBar user={user} onLogout={handleLogout} />

      <div className="page-header">
        <h1 className="page-title">{t("adminDashboard.title")}</h1>
        <p className="project-description">
          {t("adminDashboard.description")}
        </p>
      </div>

      <ProjectGrid 
        projects={projects} 
        onProjectClick={(id) => navigate(`/admin/projects/${id}`)} 
      />

      {user.role_id === 1 && <MasterTools />}
    </div>
  );
}