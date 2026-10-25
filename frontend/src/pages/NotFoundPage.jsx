// src/pages/NotFoundPage.jsx: rendered inside the shell.
import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, Icon } from "../components/ui";
import "./NotFoundPage.css";

export default function NotFoundPage() {
  const { t } = useTranslation("nav");
  const state = useLocation().state || {};

  return (
    <div className="notice-page" data-testid="not-found-page">
      <span className="notice-icon"><Icon name="search" /></span>
      <h1 className="notice-title">{state.title || t("notFound.title")}</h1>
      <p className="notice-message">{state.message || t("notFound.message")}</p>
      <div className="notice-actions">
        <Button as={Link} to="/recordings" data-testid="not-found-home">{t("notFound.action")}</Button>
      </div>
    </div>
  );
}
