// frontend/src/components/SiteManagement/SiteTable.jsx
import React from "react";
import { useTranslation } from "react-i18next";
import "../ProjectManagement/ProjectTable.css";

export default function SiteTable({ sites, onEdit, onToggleActive, onManageProjects, onAddClick }) {
  const { t } = useTranslation(["admin", "common"]);

  const copyToken = (token) => {
    navigator.clipboard.writeText(token);
  };

  return (
    <section className="section card admin-management-page">
      <div className="section-header-row">
        <h3 className="section-title">{t("management.siteManagement.tableTitle")}</h3>
        <button className="btn-primary btn-sm btn-add" onClick={onAddClick}>
          + {t("management.siteManagement.createNew")}
        </button>
      </div>

      <div className="table-scroll-area">
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>{t("management.siteManagement.table.name")}</th>
              <th>{t("management.siteManagement.table.description")}</th>
              <th>{t("management.siteManagement.table.projects")}</th>
              <th>{t("management.siteManagement.table.token")}</th>
              <th>{t("management.siteManagement.table.status")}</th>
              <th>{t("management.siteManagement.table.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {sites.map((s) => (
              <tr key={s.id}>
                <td>{s.id}</td>
                <td className="highlighted">{s.name}</td>
                <td className="text-muted" style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.description}
                </td>
                <td>{s.project_count ?? 0}</td>
                <td>
                  <code className="link-text-inline">{s.access_token?.slice(0, 8)}…</code>
                  <button
                    className="btn-mgmt-icon"
                    title={t("management.siteManagement.copyToken")}
                    onClick={() => copyToken(s.access_token)}
                  >
                    📋
                  </button>
                </td>
                <td>
                  <span className={`status-badge ${s.is_active ? "active" : "inactive"}`}>
                    {s.is_active ? t("projectDashboard.status.active") : t("projectDashboard.status.inactive")}
                  </span>
                </td>
                <td className="actions-cell">
                  <button
                    className="btn-mgmt-icon btn-edit"
                    title={t("protocolDashboard.buttons.edit")}
                    onClick={() => onEdit(s)}
                  >
                    ✒️
                  </button>
                  <button
                    className="btn-mgmt-icon"
                    title={t("management.siteManagement.manageProjects")}
                    onClick={() => onManageProjects(s)}
                  >
                    📂
                  </button>
                  <button
                    className={`btn-mgmt-icon ${s.is_active ? "btn-deactivate" : "btn-activate"}`}
                    onClick={() => onToggleActive(s, !s.is_active)}
                    title={s.is_active ? t("management.status.archive") : t("management.status.activate")}
                  >
                    {s.is_active ? "🚫" : "✅"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}