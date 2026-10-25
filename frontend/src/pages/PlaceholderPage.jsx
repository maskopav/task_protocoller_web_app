// src/pages/PlaceholderPage.jsx: stands in for screens that are built in a later batch.
import React from "react";
import { useTranslation } from "react-i18next";
import "./NotFoundPage.css";

export default function PlaceholderPage({ titleKey, messageKey, testId }) {
  const { t } = useTranslation("nav");
  return (
    <div className="notice-page" data-testid={testId}>
      <h1 className="notice-title">{t(titleKey)}</h1>
      <p className="notice-message">{t(messageKey)}</p>
    </div>
  );
}
