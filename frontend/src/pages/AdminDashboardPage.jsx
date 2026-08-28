import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useUser } from "../context/UserContext";
import { fetchProjectsList } from "../api/projects";
import { fetchSitesList } from "../api/sites";

// Shared & Local Components
import DashboardTopBar from "../components/DashboardTopBar/DashboardTopBar";
import ProjectGrid from "../components/AdminDashboard/ProjectGrid";
import SiteGrid from "../components/AdminDashboard/SiteGrid";
import MasterTools from "../components/AdminDashboard/MasterTools";

import "./Pages.css";

export default function AdminDashboardPage() {
  const { t } = useTranslation(["admin", "common"]);
  const navigate = useNavigate();
  const { user } = useUser();
  const [projects, setProjects] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }

    if (user) {
      // Find the role name from the mappings or user object
      // Assuming user.role contains the name (e.g., 'admin' or 'master')
      Promise.all([
        fetchProjectsList(user.id, user.role),
        fetchSitesList(user.id, user.role)
      ])
        .then(([projectData, siteData]) => {
          setProjects(projectData);
          setSites(siteData);
        })
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

      <SiteGrid
        sites={sites}
        onSiteClick={(id) => navigate(`/admin/sites/${id}`)}
      />

      <ProjectGrid
        projects={projects}
        onProjectClick={(id) => navigate(`/admin/projects/${id}`)}
      />

      {user.role_id === 1 && <MasterTools />}
    </div>
  );
}