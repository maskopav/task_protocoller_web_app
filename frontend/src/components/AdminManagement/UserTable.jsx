// frontend/src/components/AdminManagement/UserTable.jsx
import React from "react";
import { useTranslation } from "react-i18next";
import AssignIcon from "../Icons/AssignIcon"; // Reusing the shared icon
import "./AdminManagement.css";

export default function UserTable({ users, onToggleStatus, onEdit, onAssignProject, onAssignSite, onAddClick, onToggleRight }) {
  const { t } = useTranslation(["admin", "common"]);

  // mysql2 hands booleans back as 0/1 depending on driver config.
  const on = (v) => v === 1 || v === true;

  return (
    <section className="section card">
      <div className="section-header-row">
        <h3 className="section-title users-title">{t("management.title")}</h3>
        <button className="btn-primary btn-sm btn-add" onClick={onAddClick}>
          + {t("management.addUser")}
        </button>
      </div>

      <div className="table-scroll-area">
        <table className="table">
          <thead>
            <tr>
              <th>{t("management.table.id")}</th>
              <th>{t("management.table.fullName")}</th>
              <th>{t("management.table.user")}</th>
              <th>{t("management.table.role")}</th>
              <th>{t("management.table.status")}</th>
              <th style={{ textAlign: "center" }}>{t("management.table.canCreateProjects")}</th>
              <th style={{ textAlign: "center" }}>{t("management.table.canCreateSites")}</th>
              <th style={{ textAlign: "center" }}>{t("management.table.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.user_id}>
                <td>{u.user_id}</td>
                <td><strong>{u.full_name || "—"}</strong></td>
                <td>{u.user_email}</td>
                <td><span className="user-role-badge">{u.role}</span></td>
                <td>
                  <span className={`status-badge ${u.is_active ? "active" : "inactive"}`}>
                    {u.is_active ? t("management.status.active") : t("management.status.inactive")}
                  </span>
                </td>
                {/* The two creation rights, granted and revoked in place —
                    they belong to the user, not to any assignment. */}
                <td style={{ textAlign: "center" }}>
                  <input
                    type="checkbox"
                    className="checkbox-input"
                    checked={on(u.can_create_projects)}
                    title={t("management.table.canCreateProjects")}
                    onChange={() => onToggleRight(u.user_id, "can_create_projects", !on(u.can_create_projects))}
                  />
                </td>
                <td style={{ textAlign: "center" }}>
                  <input
                    type="checkbox"
                    className="checkbox-input"
                    checked={on(u.can_create_sites)}
                    title={t("management.table.canCreateSites")}
                    onChange={() => onToggleRight(u.user_id, "can_create_sites", !on(u.can_create_sites))}
                  />
                </td>
                <td>
                  <div className="actions-cell">
                    {/* Edit Button */}
                    <button 
                      className="btn-mgmt-icon btn-edit" 
                      title={t("management.buttons.edit")} 
                      onClick={() => onEdit(u)}
                    >
                      ✒️
                    </button>

                    {/* Purple Assign Button */}
                    <button 
                      className="btn-mgmt-icon btn-assign-purple" 
                      title={t("management.buttons.assign")} 
                      onClick={() => onAssignProject(u)}
                    >
                      <AssignIcon title={t("management.buttons.assign")} />
                    </button>

                    {/* Site Assign Button */}
                    <button
                      className="btn-mgmt-icon btn-assign-purple"
                      title={t("management.buttons.assignSite")}
                      onClick={() => onAssignSite(u)}
                    >
                      🏥
                    </button>

                    {/* Dynamic Status Toggle Button */}
                    <button 
                      className={`btn-mgmt-icon ${u.is_active ? "btn-deactivate" : "btn-activate"}`}
                      onClick={() => onToggleStatus(u.user_id, u.is_active)}
                      title={u.is_active ? t("management.buttons.deactivate") : t("management.buttons.activate")}
                    >
                      {u.is_active ? "🚫" : "✅"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}