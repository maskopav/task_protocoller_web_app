import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchActivity } from "../../api/uploads";
import { formatDateTime } from "../../utils/formatDate";
import { activityText } from "./activityText";
import "./Recording.css";

/**
 * Collapsed Activity section from GET /uploads/:sid/activity (F-044): reveals, participant
 * edits, review changes and downloads. `refreshKey` changes when the page did something
 * that writes an entry, so a reveal shows up without a reload.
 */
export default function ActivitySection({ sessionId, refreshKey = 0 }) {
  const { t } = useTranslation("recording");
  const [entries, setEntries] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetchActivity(sessionId)
      .then((rows) => { if (live) { setEntries(Array.isArray(rows) ? rows : []); setFailed(false); } })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [sessionId, refreshKey]);

  return (
    <details className="recd-card recd-fold" data-testid="recording-activity">
      <summary>
        <h2>{t("activity.title")}</h2>
        {entries && <span className="recd-xs">· {t("activity.count", { count: entries.length })}</span>}
      </summary>
      {failed ? (
        <p className="recd-note" role="alert">{t("activity.failed")}</p>
      ) : entries == null ? (
        <p className="recd-note">{t("activity.loading")}</p>
      ) : entries.length === 0 ? (
        <p className="recd-note">{t("activity.none")}</p>
      ) : (
        <ul className="recd-list">
          {entries.map((a) => (
            <li key={a.id} data-testid="activity-entry">
              <span className="when">{formatDateTime(a.at)}</span>
              <span>{activityText(t, a)}</span>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
