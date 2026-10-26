import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { clipUrl } from "../../api/uploads";
import { Button } from "../ui";
import "../Recording/Recording.css";

/**
 * Inline audio/video player for one clip. The media element is created on the first
 * click (so no request, and no ticket, is spent on clips nobody plays), and if the
 * ticket expired mid-playback the element reloads with a fresh one at the same position.
 * A clip the browser cannot decode (e.g. MJPEG in MP4) ends in a plain sentence with a
 * download link instead of a broken player (F-037).
 */
export default function ClipPlayer({ sessionId, file, kind, tickets, autoOpen = false }) {
  const { t } = useTranslation("recording");
  const [src, setSrc] = useState(null);
  const [failedUrl, setFailedUrl] = useState(null); // set (possibly "") once the clip cannot play
  const el = useRef(null);
  const retried = useRef(false);
  const label = kind === "video" ? t("tasks.playVideo") : t("tasks.playAudio");

  const giveUp = async () => {
    const ticket = await tickets.getTicket().catch(() => null);
    setSrc(null);
    setFailedUrl(ticket ? clipUrl(sessionId, file, ticket) : "");
  };

  const open = async () => {
    const ticket = await tickets.getTicket();
    if (!ticket) return giveUp();
    setFailedUrl(null);
    retried.current = false;
    setSrc(clipUrl(sessionId, file, ticket));
  };

  const onError = async () => {
    if (retried.current) return giveUp();
    retried.current = true;
    const at = el.current?.currentTime || 0;
    const ticket = await tickets.refresh();
    if (!ticket) return giveUp();
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

  if (failedUrl !== null) {
    return (
      <span className="recd-cantplay" role="status" data-testid="clip-cant-play">
        {t("clip.cantPlay")}
        {failedUrl && <a className="recd-link" href={failedUrl} download>{t("clip.download")}</a>}
      </span>
    );
  }
  if (!src) {
    return (
      <Button
        size="sm"
        icon={kind === "video" ? "video" : "play"}
        aria-label={label}
        title={kind === "video" ? t("tasks.videoNoSound") : label}
        onClick={open}
      />
    );
  }
  return (
    <span className="recd-player">
      {kind === "video" ? (
        <video ref={el} src={src} controls autoPlay preload="metadata" onError={onError} aria-label={label} />
      ) : (
        <audio ref={el} src={src} controls autoPlay preload="metadata" onError={onError} aria-label={label} />
      )}
    </span>
  );
}
