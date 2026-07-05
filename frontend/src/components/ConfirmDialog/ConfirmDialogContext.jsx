import React, { createContext, useContext, useState, useCallback } from "react";
import "./ConfirmDialog.css"

export const ConfirmDialogContext = createContext();

export function ConfirmDialogProvider({ children }) {
  const [dialog, setDialog] = useState({
    open: false,
    title: "",
    headerRight: null, 
    message: "",
    confirmText: "Confirm",
    cancelText: "Cancel",
    infoOnly: false,
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
        resolve,
      });
    });
  }, []);

  const handleConfirm = () => {
    dialog.resolve(true);
    setDialog((d) => ({ ...d, open: false }));
  };

  const handleCancel = () => {
    dialog.resolve(false);
    setDialog((d) => ({ ...d, open: false }));
  };

  return (
    <ConfirmDialogContext.Provider value={{ confirm, isDialogOpen: dialog.open }}>
      {children}

      {dialog.open && (
        <div className="confirm-backdrop">
          <div className="confirm-dialog">
            <div className="confirm-header">
              {dialog.title && dialog.title.trim() !== "" && (
                <h2>{dialog.title}</h2>
              )}
              {dialog.headerRight && (
                <div className="confirm-header-right">
                  {dialog.headerRight}
                </div>
              )}
            </div>

            <div className="confirm-message-content">
              {dialog.message}
            </div>

            <div className="confirm-buttons">
              {dialog.infoOnly ? (
                <button className="btn-confirm" onClick={handleConfirm}>
                  {dialog.confirmText}
                </button>
              ) : (
                <>
                  <button className="btn-cancel" onClick={handleCancel}>
                    {dialog.cancelText}
                  </button>
                  <button className="btn-confirm" onClick={handleConfirm}>
                    {dialog.confirmText}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </ConfirmDialogContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmDialogContext).confirm;
}