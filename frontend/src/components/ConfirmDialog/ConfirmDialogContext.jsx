import React, { createContext, useContext, useState, useCallback } from "react";
import "./ConfirmDialog.css"

const ConfirmDialogContext = createContext();

export function ConfirmDialogProvider({ children }) {
  const [dialog, setDialog] = useState({
    open: false,
    title: "",
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
        title: options.title || "Are you sure?",
        message: options.message || "",
        confirmText: options.confirmText || "Confirm",
        cancelText: options.cancelText || "Cancel",
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
    <ConfirmDialogContext.Provider value={{ confirm }}>
      {children}

      {dialog.open && (
        <div className="confirm-backdrop">
          <div className="confirm-dialog">
            <h2>{dialog.title}</h2>
            <p>{dialog.message}</p>

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
