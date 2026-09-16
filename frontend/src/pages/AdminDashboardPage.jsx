import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useUser } from "../context/UserContext";
import { fetchProjectsList } from "../api/projects";
import { fetchSites } from "../api/sites";

// Shared & Local Components
import DashboardTopBar from "../components/DashboardTopBar/DashboardTopBar";
import ProjectGrid from "../components/AdminDashboard/ProjectGrid";
import SiteGrid from "../components/AdminDashboard/SiteGrid";
import MasterTools from "../components/AdminDashboard/MasterTools";
import MyTools from "../components/AdminDashboard/MyTools";
import ProjectModal from "../components/ProjectManagement/ProjectModal";
import SiteModal from "../components/SiteManagement/SiteModal";

import "./Pages.css";

export default function AdminDashboardPage() {
  const { t } = useTranslation(["admin", "common"]);
  const navigate = useNavigate();
  const { user } = useUser();
  const [projects, setProjects] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showCreateSite, setShowCreateSite] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }

    if (user) {
      // Find the role name from the mappings or user object
      // Assuming user.role contains the name (e.g., 'admin' or 'master')
      Promise.all([
        fetchProjectsList(),
        fetchSites()
      ])
        .then(([projectData, siteData]) => {
          setProjects(projectData);
          setSites(siteData);
        })
        .catch(err => console.error(err))
        .finally(() => setLoading(false));
    }
  }, [user, navigate]);

  const reload = () => {
    Promise.all([fetchProjectsList(), fetchSites()])
      .then(([projectData, siteData]) => {
        setProjects(projectData);
        setSites(siteData);
      })
      .catch(err => console.error(err));
  };

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

      {/* A master reaches both of these through MasterTools below; this row is
          what a granted admin gets instead. */}
      {user.role_id !== 1 && (
        <MyTools
          canCreateProjects={!!user.can_create_projects}
          canCreateSites={!!user.can_create_sites}
          onCreateProject={() => setShowCreateProject(true)}
          onCreateSite={() => setShowCreateSite(true)}
        />
      )}

      <ProjectModal
        open={showCreateProject}
        onClose={() => setShowCreateProject(false)}
        onSuccess={reload}
      />

      {showCreateSite && (
        <SiteModal
          site={null}
          onClose={() => setShowCreateSite(false)}
          onSuccess={reload}
        />
      )}

      {user.role_id === 1 && <MasterTools />}
    </div>
  );
}