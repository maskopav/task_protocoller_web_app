import React, { useEffect, useRef, useState } from "react";
import { clipUrl } from "../../api/uploads";
import useUploadLabels from "./useUploadLabels";
import "./Uploads.css";

/**
 * Inline audio/video player for one clip. The media element is created on the first
 * click (so no request, and no ticket, is spent on clips nobody plays), and if the
 * ticket expired mid-playback the element reloads with a fresh one at the same position.
 */
export default function ClipPlayer({ sessionId, file, kind, tickets, disabled, autoOpen = false }) {
  const { t } = useUploadLabels();
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);
  const el = useRef(null);
  const retried = useRef(false);
  const label = kind === "video" ? t("tasks.playVideo") : t("tasks.playAudio");

  const open = async () => {
    const ticket = await tickets.getTicket();
    if (!ticket) return setFailed(true);
    setFailed(false);
    retried.current = false;
    setSrc(clipUrl(sessionId, file, ticket));
  };

  const onError = async () => {
    if (retried.current) return setFailed(true);
    retried.current = true;
    const at = el.current?.currentTime || 0;
    const ticket = await tickets.refresh();
    if (!ticket) return setFailed(true);
    setSrc(clipUrl(sessionId, file, ticket));
    const node = el.current;
    node?.addEventListener("loadedmetadata", () => {
      node.currentTime = at;
      node.play().catch(() => {});
    }, { once: true });
  };

  useEffect(() => {
    if (autoOpen) open();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!src) {
    return (
      <button
        type="button"
        className={`um-play${kind === "video" ? " video" : ""}`}
        aria-label={label}
        title={kind === "video" ? t("tasks.videoNoSound") : label}
        disabled={disabled}
        onClick={open}
      >
        {kind === "video" ? "🎥" : "▶"}
      </button>
    );
  }
  return (
    <span className="um-player">
      {kind === "video" ? (
        <video ref={el} src={src} controls autoPlay preload="metadata" onError={onError} aria-label={label} />
      ) : (
        <audio ref={el} src={src} controls autoPlay preload="metadata" onError={onError} aria-label={label} />
      )}
      {failed && <span className="um-tag bad">{t("tasks.playFailed")}</span>}
    </span>
  );
}
