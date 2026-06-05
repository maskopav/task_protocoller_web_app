import React from "react";
import { useConfirm } from "../ConfirmDialog/ConfirmDialogContext";
import infoIcon from "../../assets/generalIcons/info-icon.svg"; 
import "./InfoToolTip.css";

export default function InfoTooltip({ title, text }) {
  const confirm = useConfirm();

  if (!text) return null;

  const handleClick = (e) => {
    e.preventDefault(); 
    e.stopPropagation();
    confirm({
      infoOnly: true,
      title: title || "Instructions",
      message: text,
      confirmText: "Close"
    });
  };

  return (
    <button 
      className="info-tooltip-btn" 
      onClick={handleClick}
      aria-label="More information"
      type="button"
    >
      <img src={infoIcon} alt="Info" className="info-icon-svg" />
    </button>
  );
}