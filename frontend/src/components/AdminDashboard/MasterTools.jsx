// src/components/AdminDashboard/MasterTools.jsx
import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import "./AdminDashboard.css";

export default function MasterTools() {
  const navigate = useNavigate();
  const { t } = useTranslation(["admin"]);

  return (
    <section className="dashboard-section master-tools">
      <h2 className="section-heading">
        {t("adminDashboard.masterTools.heading")}
      </h2>
      
      <div className="actions-grid">
        {/* Admin User Management Card */}
        <button className="action-card btn-participants" onClick={() => navigate("/admin/admin-management")}>
          <div className="icon">👤</div>
          <div className="text">
            <h3>{t("adminDashboard.masterTools.users")}</h3>
            <p>{t("adminDashboard.masterTools.usersDesc")}</p>
          </div>
        </button>

        {/* Global Projects Card */}
        <button className="action-card btn-protocols" onClick={() => navigate("/admin/project-management")}>
          <div className="icon">📂</div>
          <div className="text">
            <h3>{t("adminDashboard.masterTools.projects")}</h3>
            <p>{t("adminDashboard.masterTools.projectsDesc")}</p>
          </div>
        </button>
      </div>
    </section>
  );
}