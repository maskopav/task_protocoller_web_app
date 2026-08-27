// frontend/src/pages/SiteManagementPage.jsx
import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import DashboardTopBar from "../components/DashboardTopBar/DashboardTopBar";
import SiteTable from "../components/SiteManagement/SiteTable";
import SiteModal from "../components/SiteManagement/SiteModal";
import SiteProjectsModal from "../components/SiteManagement/SiteProjectsModal";
import { fetchSites, updateSite } from "../api/sites";
import "./Pages.css";

export default function SiteManagementPage() {
  const { t } = useTranslation(["admin", "common"]);
  const navigate = useNavigate();

  // Sites are intentionally NOT in the public mappings context — they carry
  // access tokens, so they only travel over the authenticated /sites API.
  const [sites, setSites] = useState([]);
  const [editingSite, setEditingSite] = useState(null);
  const [managingSite, setManagingSite] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setSites(await fetchSites());
    } catch (err) {
      console.error("Failed to load sites:", err);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleToggleActive = async (site, newStatus) => {
    try {
      await updateSite(site.id, {
        name: site.name,
        description: site.description,
        config_json: site.config_json,
        is_active: newStatus,
      });
      loadData();
    } catch (err) {
      console.error("Update failed:", err);
      alert(t("management.alerts.updateError"));
    }
  };

  return (
    <div className="dashboard-page">
      <DashboardTopBar onBack={() => navigate("/admin")} />

      <div className="page-header">
        <h1 className="page-title">{t("management.siteManagement.title")}</h1>
        <p className="project-description">
          {t("management.siteManagement.description")}
        </p>
      </div>

      <div className="management-sections">
        <SiteTable
          sites={sites}
          onEdit={setEditingSite}
          onToggleActive={handleToggleActive}
          onManageProjects={setManagingSite}
          onAddClick={() => setShowAddModal(true)}
        />
      </div>

      {showAddModal && (
        <SiteModal
          site={null}
          onClose={() => setShowAddModal(false)}
          onSuccess={loadData}
        />
      )}

      {editingSite && (
        <SiteModal
          site={editingSite}
          onClose={() => setEditingSite(null)}
          onSuccess={loadData}
        />
      )}

      {managingSite && (
        <SiteProjectsModal
          site={managingSite}
          onClose={() => setManagingSite(null)}
          onChanged={loadData}
        />
      )}
    </div>
  );
}