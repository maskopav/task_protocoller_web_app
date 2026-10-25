// src/components/ui/Button.jsx
import React from "react";
import { Icon } from "./icons.jsx";
import "./ui.css";

/**
 * @param {'primary'|'secondary'|'quiet'|'danger'} [variant='secondary']
 * @param {'md'|'sm'} [size='md']
 * @param {string} [icon] icon name shown before the label
 * @param {React.ElementType} [as='button'] e.g. `a` or react-router's `Link`
 * At most ONE variant="primary" per rendered page.
 */
export function Button({ variant = "secondary", size = "md", icon, as, className = "", children, type, ...props }) {
  const Comp = as || "button";
  const cls = [
    "ui-btn",
    variant === "primary" && "ui-btn-primary",
    variant === "quiet" && "ui-btn-quiet",
    variant === "danger" && "ui-btn-danger",
    size === "sm" && "ui-btn-sm",
    className,
  ].filter(Boolean).join(" ");
  const extra = Comp === "button" ? { type: type || "button" } : {};
  return (
    <Comp className={cls} {...extra} {...props}>
      {icon && <Icon name={icon} />}
      {children}
    </Comp>
  );
}

/** Icon-only button. `label` becomes both aria-label and the tooltip (title). */
export function IconButton({ icon, label, as, className = "", type, ...props }) {
  const Comp = as || "button";
  const extra = Comp === "button" ? { type: type || "button" } : {};
  return (
    <Comp className={`ui-btn ui-icon-btn ${className}`.trim()} aria-label={label} title={label} {...extra} {...props}>
      <Icon name={icon} />
    </Comp>
  );
}
