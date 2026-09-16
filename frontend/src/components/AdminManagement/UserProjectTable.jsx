// frontend/src/components/AdminManagement/UserProjectTable.jsx
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import DeleteIcon from "../Icons/DeleteIcon";
import ProjectSiteAccess from "./ProjectSiteAccess";
import "./AdminManagement.css";

export default function UserProjectTable({ assignments, onRemove, onToggleCanEdit }) {
  const { t } = useTranslation(["admin", "common"]);
  const [expanded, setExpanded] = useState(null);

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
              <th>{t("management.projectAssignments.table.rights")}</th>
              <th>{t("management.projectAssignments.table.clinics")}</th>
              <th>{t("management.projectAssignments.table.date")}</th>
              <th style={{ textAlign: "center" }}>{t("management.table.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((a) => (
              <React.Fragment key={a.assignment_id}>
              <tr>
                <td className="highlighted">{a.user_name}</td>
                <td>{a.user_email}</td>
                <td><span className="project-tag">{a.project_name}</span></td>
                <td>
                  {/* Read-only means the admin watches the project but cannot
                      change it or its protocols. */}
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      className="checkbox-input"
                      checked={a.can_edit === 1 || a.can_edit === true}
                      onChange={() => onToggleCanEdit(
                        a.assignment_id,
                        !(a.can_edit === 1 || a.can_edit === true)
                      )}
                    />
                    <span>{(a.can_edit === 1 || a.can_edit === true)
                      ? t("management.projectAssignments.canEdit")
                      : t("management.projectAssignments.readOnly")}</span>
                  </label>
                </td>
                <td>
                  <button
                    className="btn-secondary btn-sm"
                    onClick={() => setExpanded(expanded === a.assignment_id ? null : a.assignment_id)}
                  >
                    {expanded === a.assignment_id ? "▾" : "▸"} {t("management.projectAssignments.table.clinics")}
                  </button>
                </td>
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
              {expanded === a.assignment_id && (
                <tr>
                  <td colSpan="7">
                    <ProjectSiteAccess userId={a.user_id} projectId={a.project_id} />
                  </td>
                </tr>
              )}
              </React.Fragment>
            ))}
            {assignments.length === 0 && (
              <tr><td colSpan="7" className="empty-row">{t("management.projectAssignments.noData")}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}