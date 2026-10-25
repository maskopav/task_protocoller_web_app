// src/components/ui/Modal.jsx
import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import "./ui.css";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Generic dialog: Esc and backdrop click close it, Tab is trapped inside, focus returns on close.
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {React.ReactNode} title
 * @param {React.ReactNode} [description]
 * @param {React.ReactNode} [footer]  usually Buttons; the caller owns the single primary one
 * @param {'md'|'wide'} [size='md']
 * @param {boolean} [dismissible=true] false disables Esc/backdrop close (e.g. while saving)
 */
export function Modal({ open, onClose, title, description, footer, size = "md", dismissible = true, children, ...rest }) {
  const titleId = useId();
  const box = useRef(null);
  const returnTo = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    returnTo.current = document.activeElement;
    const node = box.current;
    const first = node?.querySelector("[data-autofocus]") || node?.querySelector(`.ui-modal-body ${FOCUSABLE.split(",").join(",.ui-modal-body ")}`) || node?.querySelector(FOCUSABLE);
    (first || node)?.focus();

    const onKey = (e) => {
      if (e.key === "Escape" && dismissible) { e.stopPropagation(); onCloseRef.current?.(); return; }
      if (e.key !== "Tab" || !node) return;
      const els = [...node.querySelectorAll(FOCUSABLE)];
      if (els.length === 0) { e.preventDefault(); return; }
      const firstEl = els[0];
      const lastEl = els[els.length - 1];
      if (e.shiftKey && (document.activeElement === firstEl || document.activeElement === node)) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const prev = returnTo.current;
      if (prev && typeof prev.focus === "function" && document.contains(prev)) prev.focus();
    };
  }, [open, dismissible]);

  if (!open) return null;

  return createPortal(
    <div
      className="ui-modal-back"
      onMouseDown={(e) => { if (dismissible && e.target === e.currentTarget) onClose?.(); }}
    >
      <div
        className={`ui-modal${size === "wide" ? " ui-modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        ref={box}
        {...rest}
      >
        {(title || description) && (
          <div className="ui-modal-head">
            {title && <h2 id={titleId}>{title}</h2>}
            {description && <p>{description}</p>}
          </div>
        )}
        {children != null && <div className="ui-modal-body">{children}</div>}
        {footer && <div className="ui-modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
