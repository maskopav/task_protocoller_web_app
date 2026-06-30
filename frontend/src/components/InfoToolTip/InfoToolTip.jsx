// src/components/InfoTooltip/InfoTooltip.jsx
import React from "react";
import { useConfirm } from "../ConfirmDialog/ConfirmDialogContext";
import { useTranslation } from "react-i18next";
import infoIcon from "../../assets/generalIcons/info-icon.svg"; 
import "./InfoToolTip.css";

export default function InfoTooltip({ title, text, icon }) {
  const { t } = useTranslation(["common"]);
  const confirm = useConfirm();

  if (!text) return null;

  const handleClick = (e) => {
    e.preventDefault(); 
    e.stopPropagation();
    confirm({
      infoOnly: true,
      title: title,
      message: text,
      confirmText: t("buttons.cancel")
    });
  };

  // Default to infoIcon if no custom icon is provided
  const displayIcon = icon || infoIcon;

  return (
    <button 
      className="info-tooltip-btn" 
      onClick={handleClick}
      aria-label="More information"
      type="button"
    >
      <img src={displayIcon} alt="Info" className="info-icon-svg" />
    </button>
  );
}