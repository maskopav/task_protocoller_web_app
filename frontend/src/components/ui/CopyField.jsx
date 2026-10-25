// src/components/ui/CopyField.jsx
import React, { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { IconButton } from "./Button.jsx";
import "./ui.css";

/** Read-only mono value with a copy button. `masked` shows dots instead of the value (copy still copies it). */
export function CopyField({ value, masked = false, label, onCopied }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const text = String(value ?? "");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      onCopied?.(value);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <div className="ui-copyfield">
      <span className="ui-copyfield-val" title={masked ? undefined : text} aria-label={label}>
        {masked ? "•".repeat(Math.min(text.length, 24)) : text}
      </span>
      <IconButton
        icon={copied ? "check" : "copy"}
        label={copied ? t("ui.copied", "Copied") : t("ui.copy", "Copy")}
        onClick={copy}
      />
    </div>
  );
}
