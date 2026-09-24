// src/components/Common/DashboardTopBar.jsx
import React from "react";
import { useTranslation } from "react-i18next";
import { useUser } from "../../context/UserContext";
import { LanguageSwitcher } from "../LanguageSwitcher/LanguageSwitcher";
import { ROLES } from "../../constants/roles";
import "./DashboardTopBar.css";

const ROLE_LABELS = {
  [ROLES.MASTER]: "Master",
  [ROLES.ADMIN]: "Admin",
  [ROLES.SURVEY_AGENCY]: "Survey Agency",
};

export default function DashboardTopBar({ onBack, backLabel }) {
  const { t } = useTranslation(["common"]);
  const { user, logout } = useUser();

  return (
    <div className="top-bar-container">
      <div className="top-bar-left">
        {onBack && (
          <button className="btn-return" onClick={onBack}>
            ← {backLabel || t("buttons.back")}
          </button>
        )}
      </div>
      
      <div className="top-bar-right">
        {/* Only show user info and logout if user is defined */}
        {user && (
          <>
            <div className="user-info-section">
              <span className="user-name">{user.full_name}</span>
              <span className="user-role-badge">
                {ROLE_LABELS[user.role] || "Admin"}
              </span>
            </div>
            <div className="top-bar-divider"></div>
            <button className="btn-secondary btn-logout" onClick={logout}>
              {t("buttons.logout")}
            </button>
            <div className="top-bar-divider"></div>
          </>
        )}

        {/* Language switcher is always visible */}
        <div className="language-switcher-wrapper">
          <LanguageSwitcher />
        </div>
      </div>
    </div>
  );
}