import React from "react";
import useUploadLabels from "../useUploadLabels";
import UploadsSummaryCard from "./UploadsSummaryCard";
import DevicesSummaryCard from "./DevicesSummaryCard";
import "../../AdminDashboard/AdminDashboard.css";

/**
 * Dashboard "Monitoring" row: the Uploads and Devices cards. Masters always
 * see it, admins as soon as they have at least one site in scope.
 */
export default function MonitoringCards({ isMaster, sitesCount }) {
  const { t } = useUploadLabels();
  if (!isMaster && !sitesCount) return null;
  return (
    <section className="dashboard-section" data-testid="monitoring-cards">
      <h2 className="section-heading">{t("cards.monitoring")}</h2>
      <div className="actions-grid">
        <UploadsSummaryCard sitesCount={sitesCount} />
        <DevicesSummaryCard />
      </div>
    </section>
  );
}
