// src/components/ProtocolEditor/Modal.jsx
import React from "react";
import "./ProtocolEditor.css";
import { useTranslation } from "react-i18next";

/**
 * Generic reusable modal for admin tasks and questionnaires.
 * 
 * @param {boolean} open - whether the modal is visible
 * @param {function} onClose - called when user clicks ✖
 * @param {function} onSave - called when user clicks Save
 * @param {string} [title] - optional title displayed at the top
 * @param {string|JSX.Element} [description] - optional text or JSX under the title
 * @param {boolean} [showSaveButton=true] - whether to render the Save button
 * @param {boolean} [showCancelButton=false] - render a Cancel button next to Save
 * @param {React.ReactNode} children - the modal content (forms, etc.)
 */
export default function AdminModal({
  open,
  onClose,
  onSave,
  title,
  description,
  showSaveButton = true,
  showCancelButton = false,
  children,
}) {
  const { t } = useTranslation("admin");
  if (!open) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-box">
        <button className="modal-close" onClick={onClose}>✖</button>

        <div className="modal-content">
          {title && <h2>{title}</h2>}
          {description && <p className="modal-description">{description}</p>}
          {children}
        </div>

        {(showSaveButton || showCancelButton) && (
          <div className="modal-actions">
            {showCancelButton && (
              <button className="btn-cancel" onClick={onClose}>
                {t("protocolEditor.buttons.cancel")}
              </button>
            )}
            {showSaveButton && (
              <button className="btn-save" onClick={onSave}>
                {t("protocolEditor.buttons.save")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
