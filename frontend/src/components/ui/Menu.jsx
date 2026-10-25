// src/components/ui/Menu.jsx
import React, { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { IconButton } from "./Button.jsx";
import { Icon } from "./icons.jsx";
import "./ui.css";

/**
 * Three-dots dropdown. Closes on Esc, outside click and Tab; arrow keys move between items.
 * @param {string} [label] aria-label of the trigger
 * @param {Array<{label?: string, icon?: string, onSelect?: Function, href?: string, danger?: boolean, disabled?: boolean, separator?: boolean}>} items
 * @param {'right'|'left'} [align='right']
 */
export function Menu({ label, items = [], align = "right", icon = "more" }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const trigger = useRef(null);

  const close = useCallback((refocus) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (root.current && !root.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (open) root.current?.querySelector('[role="menuitem"]:not([disabled])')?.focus();
  }, [open]);

  const onKeyDown = (e) => {
    if (!open) return;
    if (e.key === "Escape") { e.stopPropagation(); close(true); return; }
    const els = [...root.current.querySelectorAll('[role="menuitem"]:not([disabled])')];
    const i = els.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); els[(i + 1) % els.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); els[(i - 1 + els.length) % els.length]?.focus(); }
    else if (e.key === "Home") { e.preventDefault(); els[0]?.focus(); }
    else if (e.key === "End") { e.preventDefault(); els[els.length - 1]?.focus(); }
    else if (e.key === "Tab") setOpen(false);
  };

  return (
    <div className={`ui-menu${align === "left" ? " ui-menu-left" : ""}`} ref={root} onKeyDown={onKeyDown}>
      <IconButton
        ref={trigger}
        icon={icon}
        label={label || t("ui.more", "More actions")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
      />
      {open && (
        <div className="ui-menu-pop" role="menu">
          {items.map((item, i) => {
            if (item.separator) return <div key={`sep-${i}`} className="ui-menu-sep" role="separator" />;
            const cls = `ui-menu-item${item.danger ? " ui-menu-danger" : ""}`;
            const content = (<>{item.icon && <Icon name={item.icon} />}{item.label}</>);
            if (item.href) {
              return <a key={item.label} role="menuitem" className={cls} href={item.href} onClick={() => close(false)}>{content}</a>;
            }
            return (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={cls}
                disabled={item.disabled}
                onClick={(e) => { e.stopPropagation(); close(true); item.onSelect?.(e); }}
              >
                {content}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
