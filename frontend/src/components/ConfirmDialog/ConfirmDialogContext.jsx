import React, { createContext, useContext, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../ui/Modal.jsx";
import { Button } from "../ui/Button.jsx";
import "./ConfirmDialog.css";

export const ConfirmDialogContext = createContext();

// Restyled onto the UI kit Modal. API unchanged:
// confirm({ title, message, confirmText, cancelText, infoOnly, headerRight }) -> Promise<boolean>
// New optional: `danger: true` renders the confirm button as a danger button.
export function ConfirmDialogProvider({ children }) {
  const { t } = useTranslation();
  const [dialog, setDialog] = useState({
    open: false,
    title: "",
    headerRight: null,
    message: "",
    confirmText: "",
    cancelText: "",
    infoOnly: false,
    danger: false,
    resolve: null,
  });

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      setDialog({
        open: true,
        title: options.title,
        headerRight: options.headerRight || null,
        message: options.message || "",
        confirmText: options.confirmText,
        cancelText: options.cancelText,
        infoOnly: options.infoOnly || false,
        danger: options.danger || false,
        resolve,
      });
    });
  }, []);

  const finish = (result) => {
    dialog.resolve?.(result);
    setDialog((d) => ({ ...d, open: false }));
  };

  const confirmLabel = dialog.confirmText || t("ui.confirm", "Confirm");
  const cancelLabel = dialog.cancelText || t("ui.cancel", "Cancel");

  return (
    <ConfirmDialogContext.Provider value={{ confirm, isDialogOpen: dialog.open }}>
      {children}
      <Modal
        open={dialog.open}
        onClose={() => finish(!!dialog.infoOnly)}
        title={typeof dialog.title === "string" ? dialog.title.trim() || undefined : dialog.title}
        footer={
          <>
            {!dialog.infoOnly && (
              <Button variant="secondary" onClick={() => finish(false)}>{cancelLabel}</Button>
            )}
            <Button
              variant={dialog.danger ? "danger" : "primary"}
              data-autofocus
              onClick={() => finish(true)}
            >
              {confirmLabel}
            </Button>
          </>
        }
      >
        {dialog.headerRight ? <div className="ui-confirm-extra">{dialog.headerRight}</div> : null}
        {dialog.message ?<div className="ui-confirm-message">{dialog.message}</div> : null}
      </Modal>
    </ConfirmDialogContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmDialogContext).confirm;
}
