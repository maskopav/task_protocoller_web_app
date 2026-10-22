import React from "react";
import { Link } from "react-router-dom";
import useUploadLabels from "../useUploadLabels";
import { useDevices } from "./hooks";
import "./UploadCards.css";

/**
 * Dashboard "Devices" card: N waiting, N silent. The backlog number only counts
 * devices whose backlog the server returned; when every device is
 * `backlogHidden` the "waiting" badge is left out rather than shown as 0.
 */
export default function DevicesSummaryCard() {
  const { t } = useUploadLabels();
  const { status, data } = useDevices();
  const devices = data?.devices ?? [];
  const showWaiting = devices.some((d) => !d.backlogHidden);
  return (
    <Link className="action-card um-link-card" to="/admin/uploads/devices" data-testid="devices-card">
      <div className="icon um-violet">🖥</div>
      <div className="text">
        <h3>{t("cards.devices.title")}</h3>
        <p>{t("cards.devices.desc")}</p>
        <div className="um-page um-embed um-badges" aria-busy={status === "loading"}>
          {status === "error" ? (
            <span className="um-quiet" role="status">{t("cards.unavailable")}</span>
          ) : !data ? (
            <span className="um-muted">…</span>
          ) : data.stats.devices === 0 ? (
            <span className="um-muted">{t("cards.devices.none")}</span>
          ) : (
            <>
              {showWaiting && <span className="um-pill warn">{t("cards.devices.waiting", { count: data.stats.waiting })}</span>}
              <span className={`um-pill ${data.stats.silent > 0 ? "bad" : "ok"}`}>{t("cards.devices.silent", { count: data.stats.silent })}</span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
