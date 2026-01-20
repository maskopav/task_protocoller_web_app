// frontend/src/components/AdminManagement/UserProjectTable.jsx
import React from "react";
import { useTranslation } from "react-i18next";
import DeleteIcon from "../Icons/DeleteIcon";
import "./AdminManagement.css";

export default function UserProjectTable({ assignments, onRemove }) {
  const { t } = useTranslation(["admin", "common"]);

  return (
    <section className="section card">
      <div className="section-header-row">
        <h3 className="section-title">{t("management.projectAssignments.title")}</h3>
      </div>

      <div className="table-scroll-area">
        <table className="table">
          <thead>
            <tr>
              <th>{t("management.table.fullName")}</th>
              <th>{t("management.table.user")}</th>
              <th>{t("management.projectAssignments.table.project")}</th>
              <th>{t("management.projectAssignments.table.date")}</th>
              <th style={{ textAlign: "center" }}>{t("management.table.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((a) => (
              <tr key={a.assignment_id}>
                <td className="highlighted">{a.user_name}</td>
                <td>{a.user_email}</td>
                <td><span className="project-tag">{a.project_name}</span></td>
                <td>{new Date(a.assigned_at).toLocaleDateString()}</td>
                <td>
                  <div className="actions-cell">
                    <button 
                      className="btn-mgmt-icon btn-deactivate" 
                      title={t("management.buttons.remove")}
                      onClick={() => onRemove(a.assignment_id)}
                    >
                      <DeleteIcon size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {assignments.length === 0 && (
              <tr><td colSpan="5" className="empty-row">{t("management.projectAssignments.noData")}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}