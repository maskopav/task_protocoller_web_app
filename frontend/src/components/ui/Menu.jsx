// src/components/ui/Menu.jsx
import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
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
  const [pos, setPos] = useState(null);
  const popup = useRef(null);

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

  // The popup is position:fixed so a scrolling ancestor (a table wrapper) can never clip it.
  // It sits under the trigger, flips above it when there is no room below, and stays on screen.
  // Scroll/resize re-place it; it only closes once the trigger has left the viewport.
  useLayoutEffect(() => {
    if (!open || !trigger.current) { setPos(null); return undefined; }
    const place = () => {
      const tr = trigger.current?.getBoundingClientRect();
      const pop = popup.current;
      if (!tr || !pop) return;
      // clientWidth/clientHeight exclude classic scrollbars, unlike window.inner*
      const vw = document.documentElement.clientWidth;
      const vh = document.documentElement.clientHeight;
      if (tr.bottom < 0 || tr.top > vh || tr.right < 0 || tr.left > vw) { setOpen(false); return; }
      const w = pop.offsetWidth;
      const h = pop.offsetHeight;
      const gap = 4;
      let top = tr.bottom + gap;
      if (top + h > vh - gap && tr.top - gap - h >= gap) top = tr.top - gap - h;
      top = Math.max(gap, Math.min(top, vh - h - gap));
      const left = Math.max(gap, Math.min(align === "left" ? tr.left : tr.right - w, vw - w - gap));
      setPos((p) => (p && p.top === top && p.left === left ? p : { top, left }));
    };
    place();
    // the popup can reflow after the first measurement (labels, fonts): re-place on its own size change
    const ro = typeof ResizeObserver === "undefined" || !popup.current ? null : new ResizeObserver(() => place());
    ro?.observe(popup.current);
    const onScroll = (e) => { if (!popup.current?.contains(e.target)) place(); };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", onScroll, true);
    return () => { ro?.disconnect(); window.removeEventListener("resize", place); window.removeEventListener("scroll", onScroll, true); };
  }, [open, align]);

  // Focus the first enabled item once per opening, when the popup first gets a position;
  // later re-placements (scroll/resize) must not pull focus back from an item the user moved to.
  const focused = useRef(false);
  useEffect(() => {
    if (!open) { focused.current = false; return; }
    if (!pos || focused.current) return;
    focused.current = true;
    root.current?.querySelector('[role="menuitem"]:not([disabled])')?.focus({ preventScroll: true });
  }, [open, pos]);

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
        <div className="ui-menu-pop" role="menu" ref={popup} style={pos || { visibility: "hidden", left: 0, top: 0 }}>
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
