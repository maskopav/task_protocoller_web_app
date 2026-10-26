// src/components/ProtocolEditor/Modal.jsx
import React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button.jsx";
import { Modal } from "../ui/Modal.jsx";
import "./ProtocolEditor.css";

/**
 * Reusable dialog for the editor's task, questionnaire and page forms, and for the admin forms
 * that still use it. A thin wrapper over the UI kit Modal that keeps the old props.
 *
 * @param {boolean} open - whether the modal is visible
 * @param {function} onClose - called by Cancel, Esc and a click on the backdrop
 * @param {function} onSave - called when the user clicks Save
 * @param {string} [title] - optional title displayed at the top
 * @param {string|JSX.Element} [description] - optional text or JSX under the title
 * @param {boolean} [showSaveButton=true] - whether to render the Save button
 * @param {boolean} [showCancelButton=false] - kept for old callers: the Cancel/Close button is always rendered
 * @param {React.ReactNode} children - the modal content (forms, etc.)
 */
export default function AdminModal({
  open,
  onClose,
  onSave,
  title,
  description,
  showSaveButton = true,
  children,
}) {
  const { t } = useTranslation("admin");
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="wide"
      footer={(
        <>
          <Button onClick={onClose} data-testid="modal-cancel">{t("protocolEditor.buttons.cancel")}</Button>
          {showSaveButton && (
            <Button variant="primary" onClick={onSave} data-testid="modal-save">{t("protocolEditor.buttons.save")}</Button>
          )}
        </>
      )}
    >
      {children}
    </Modal>
  );
}
