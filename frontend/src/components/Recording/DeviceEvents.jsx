import React from "react";
import { useTranslation } from "react-i18next";
import { hasValue } from "./recordingFormat";
import "./Recording.css";

const MAX_RAW = 4000;

/**
 * Camera or microphone events of a session as one readable sentence each (F-036).
 * The app's raw text (e.g. ffmpeg output) is kept, but only behind "Details".
 */
export default function DeviceEvents({ events = [], kind }) {
  const { t } = useTranslation("recording");
  if (!events.length) return null;
  return events.map((e, i) => {
    const code = e.event ?? e.type;
    const known = code === "interrupted" || code === "capture_failed";
    const sentence = t(`device.${kind}.${known ? code : "other"}`);
    const raw = hasValue(e.detail) ? String(e.detail).slice(0, MAX_RAW) : "";
    return (
      <span key={i} className="recd-event" data-testid={`device-event-${kind}`}>
        {sentence}
        {raw && (
          <details>
            <summary>{t("device.details")}</summary>
            <pre>{raw}</pre>
          </details>
        )}
      </span>
    );
  });
}
