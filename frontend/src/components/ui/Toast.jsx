// src/components/ui/Toast.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons.jsx";
import { ToastContext } from "./toastContext.js";
import "./ui.css";


/** One toast bubble. @param {'info'|'success'|'error'} [tone] */
export function Toast({ tone = "info", children, onClose, closeLabel = "Close" }) {
  const icon = tone === "error" ? "alert" : tone === "success" ? "check" : null;
  return (
    <div className={`ui-toast${tone !== "info" ? ` ui-toast-${tone}` : ""}`} role={tone === "error" ? "alert" : "status"}>
      {icon && <Icon name={icon} />}
      <span>{children}</span>
      {onClose && (
        <button type="button" className="ui-toast-close" aria-label={closeLabel} onClick={onClose}>
          <Icon name="x" size={14} />
        </button>
      )}
    </div>
  );
}

/** Mount once near the root (inside the router/i18n providers). Replacement for alert(). */
export function ToastProvider({ children, duration = 4000 }) {
  const [items, setItems] = useState([]);
  const nextId = useRef(1);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setItems((list) => list.filter((it) => it.id !== id));
  }, []);

  const show = useCallback((message, tone = "info", ms) => {
    if (message === null || message === undefined || message === "") return null;
    const id = nextId.current++;
    setItems((list) => [...list.slice(-3), { id, message: String(message), tone }]);
    timers.current.set(id, setTimeout(() => dismiss(id), ms ?? (tone === "error" ? duration * 2 : duration)));
    return id;
  }, [dismiss, duration]);

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => clearTimeout(t));
  }, []);

  const api = useMemo(() => ({
    show,
    info: (m, ms) => show(m, "info", ms),
    success: (m, ms) => show(m, "success", ms),
    error: (m, ms) => show(m, "error", ms),
    dismiss,
  }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="ui-toasts" aria-live="polite">
        {items.map((it) => (
          <Toast key={it.id} tone={it.tone} onClose={() => dismiss(it.id)}>{it.message}</Toast>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

