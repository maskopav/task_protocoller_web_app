// src/components/AuthForm/AuthCard.jsx — shared frame of the login, reset-password and setup-account screens.
import React from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../ui";
import { LanguageSwitcher } from "../LanguageSwitcher/LanguageSwitcher";
import "./AuthForm.css";

/** @param {{type:'error'|'success', message:string}} [status] shown under the card */
export default function AuthCard({ title, lead, status, children, "data-testid": testId }) {
  const { t } = useTranslation("users");
  return (
    <div className="auth-screen">
      <div className="auth-lang"><LanguageSwitcher /></div>
      <div className="auth-card" data-testid={testId}>
        <p className="auth-brand">{t("auth.brand")}</p>
        <h1>{title}</h1>
        {lead && <p className="auth-lead">{lead}</p>}
        {children}
      </div>
      {status?.message && (
        <div className={`auth-status ${status.type === "success" ? "status-success" : "status-error"}`} role={status.type === "success" ? "status" : "alert"}>
          <Icon name={status.type === "success" ? "check" : "alert"} size={16} />
          <span>{status.message}</span>
        </div>
      )}
    </div>
  );
}
