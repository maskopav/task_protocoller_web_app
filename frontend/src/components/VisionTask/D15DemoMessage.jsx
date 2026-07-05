import React, { useState } from "react";
import { useTranslation, Trans } from "react-i18next";
import checkIcon from "../../assets/successIcons/checkmark-icon.svg";
import "./D15DemoMessage.css";

// ── DIALOG 1: ADD COLOUR ──────────────────────────────────────────────
// How to place a cap + the goal (ordered sequence), shown together.
export function D15AddColourMessage() {
  const { t } = useTranslation("tasks");

  return (
    <div className="d15-demo-container">

      <div className="d15-demo-divider" />
      
      <span className="d15-demo-text">
          <Trans t={t} i18nKey="d15colour.addTitle" />
      </span>
      
      <div className="mechanics-section">
        <span className="d15-demo-text">
          <Trans t={t} i18nKey="d15colour.addText" />
        </span>
        <img
          src={`${import.meta.env.VITE_APP_BASE_PATH}assets/vision/demo-add-colour.gif`}
          alt={t("d15colour.addGifAlt")}
          className="d15-demo-gif"
        />
      </div>
    </div>
  );
}

// ── DIALOG 2: MODIFY COLOUR ───────────────────────────────────────────
// How to swap a placed cap + the colour-vision-problems note.
export function D15ModifyColourMessage() {
  const { t } = useTranslation("tasks");

  return (
    <div className="d15-demo-container">
            
      <span className="d15-demo-text">
          <Trans t={t} i18nKey="d15colour.modifyTitle" />
      </span>

      <div className="mechanics-section">
        <span className="d15-demo-text">
          <Trans t={t} i18nKey="d15colour.modifyText" />
        </span>
        <img
          src={`${import.meta.env.VITE_APP_BASE_PATH}assets/vision/demo-modify-colour.gif`}
          alt={t("d15colour.modifyGifAlt")}
          className="d15-demo-gif"
        />
      </div>

      <div className="d15-demo-divider" />

      <span className="d15-demo-text colour-vision-disclaimer">
        <Trans t={t} i18nKey="d15colour.disclaimerText" />
      </span>
    </div>
  );
}

// ── TABBED VERSION ────────────────────────────────────────
// Kept as-is for the in-task info tooltip — "dialog as before".
export function D15MechanicsMessage({ activeTab: initialTab = "add", onTabChange }) {
  const { t } = useTranslation("tasks");
  const [activeTab, setActiveTab] = useState(initialTab);

  const tabs = [
    { key: "add",    label: t("d15colour.controls.addTabLabel") },
    { key: "modify", label: t("d15colour.controls.modifyTabLabel") },
  ];

  const handleTabClick = (key) => {
    if (key === activeTab) return;
    setActiveTab(key);
    onTabChange?.(key);
  };

  return (
    <div className="d15-demo-container">
      <div className="mechanics-tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`mechanics-tab${activeTab === tab.key ? " mechanics-tab--active" : ""}`}
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => handleTabClick(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mechanics-section">
        <span className="d15-demo-text">
          {activeTab === "add"
            ? <Trans t={t} i18nKey="d15colour.addText" />
            : <Trans t={t} i18nKey="d15colour.modifyText" />}
        </span>
        <img
          src={`${import.meta.env.VITE_APP_BASE_PATH}assets/vision/${
            activeTab === "add" ? "demo-add-colour" : "demo-modify-colour"
          }.gif`}
          alt={activeTab === "add"
            ? t("d15colour.addGifAlt")
            : t("d15colour.modifyGifAlt")}
          className="d15-demo-gif"
        />
      </div>
    </div>
  );
}

// ── DIALOG: TRIAL COMPLETE FEEDBACK (unchanged) ───────────────────────
export function D15TrialCompleteMessage() {
  const { t } = useTranslation("tasks");

  return (
    <div className="d15-demo-container">
      <div
        className="success-icon-mask"
        style={{ '--icon-url': `url("${checkIcon}")` }}
        aria-hidden="true"
      />
      <span className="d15-demo-text">
        {t("d15colour.trialCompleteText")}
      </span>
    </div>
  );
}

export default function D15DemoMessage() {
  return <D15MechanicsMessage />;
}