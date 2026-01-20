// frontend/src/components/ProjectManagement/ProjectTable.jsx
import React from "react";
import { useTranslation } from "react-i18next";
import "./ProjectTable.css";

export default function ProjectTable({ projects, onEdit, onToggleActive, onAddClick }) {
  const { t } = useTranslation(["admin", "common"]);

  return (
    <section className="section card admin-management-page">
        <div className="section-header-row">
          <h3 className="section-title">{t("management.projectManagement.tableTitle")}</h3>
          <button className="btn-primary btn-sm btn-add" onClick={onAddClick}>
            + {t("management.projectManagement.createNew")}
          </button>
        </div>

        <div className="table-scroll-area">
        <table className="table">
            <thead>
            <tr>
                <th>ID</th>
                <th>{t("management.projectManagement.table.name")}</th>
                <th>{t("management.projectManagement.table.description")}</th>
                <th>{t("management.projectManagement.table.startDate")}</th>
                <th>{t("management.projectManagement.table.endDate")}</th>
                <th>{t("management.projectManagement.table.label")}</th>
                <th>{t("management.projectManagement.table.frequency")}</th>
                <th>{t("management.projectManagement.table.country")}</th>
                <th>{t("management.projectManagement.table.contact")}</th>
                <th>{t("management.projectManagement.table.actions")}</th>
            </tr>
            </thead>
            <tbody>
            {projects.map((p) => (
                <tr key={p.id}>
                <td>{p.id}</td>
                <td className="highlighted">{p.name}</td>
                <td className="text-muted" style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.description}
                </td>
                <td>{p.start_date?.slice(0, 10) || "-"}</td>
                <td>{p.end_date?.slice(0, 10) || "-"}</td>
                <td>
                    <span className={`status-badge ${p.is_active ? "active" : "inactive"}`}>
                    {p.is_active ? t("projectDashboard.status.active") : t("projectDashboard.status.inactive")}
                    </span>
                </td>
                <td>{p.frequency}</td>
                <td>{p.country}</td>
                <td>{p.contact_person}</td>
                <td className="actions">
                    <button className="btn-view" onClick={() => onEdit(p)}>
                    {t("protocolDashboard.buttons.edit")}
                    </button>
                    <button 
                    className={p.is_active ? "btn-delete" : "btn-save"} 
                    onClick={() => onToggleActive(p.id, !p.is_active)}
                    >
                    {p.is_active ? t("management.status.archive") : t("management.status.activate")}
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