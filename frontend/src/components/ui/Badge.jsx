// src/components/ui/Badge.jsx
import React from "react";
import { Icon } from "./icons.jsx";
import "./ui.css";

/**
 * @param {'neutral'|'ok'|'warn'|'bad'|'accent'|'outline'} [tone='neutral']
 * @param {boolean} [lock] show the lock icon (Received studies)
 * @param {string} [icon]
 */
export function Badge({ tone = "neutral", lock = false, icon, className = "", children, ...rest }) {
  const cls = ["ui-badge", tone !== "neutral" && `ui-badge-${tone}`, className].filter(Boolean).join(" ");
  const iconName = lock ? "lock" : icon;
  return (
    <span className={cls} {...rest}>
      {iconName && <Icon name={iconName} />}
      {children}
    </span>
  );
}
