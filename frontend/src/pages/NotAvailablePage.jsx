// src/pages/NotAvailablePage.jsx: a page the user may not open (master-only
// screens for a non-master). Rendered inside the shell, never a silent redirect.
import React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, Icon } from "../components/ui";
import "./NotFoundPage.css";

export default function NotAvailablePage() {
  const { t } = useTranslation("nav");

  return (
    <div className="notice-page" data-testid="not-available-page">
      <span className="notice-icon"><Icon name="lock" /></span>
      <h1 className="notice-title">{t("notAvailable.title")}</h1>
      <p className="notice-message">{t("notAvailable.message")}</p>
      <div className="notice-actions">
        <Button as={Link} to="/recordings">{t("notAvailable.action")}</Button>
      </div>
    </div>
  );
}
