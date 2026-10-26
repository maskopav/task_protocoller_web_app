// src/pages/RecordingsPage.jsx — the home page: the recordings inbox (docs/ui_redesign/02_spec.md §6.1).
// Filters, paging and the ticked rows live in useRecordingsList; the table is shared with the study and clinic tabs.
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useUser } from "../context/UserContext";
import { fetchUploadSummary } from "../api/uploads";
import { Button, Icon, Menu, PageHeader } from "../components/ui";
import RecordingsTable from "../components/Recordings/RecordingsTable";
import DownloadButton from "../components/Recordings/DownloadButton";
import useRecordingsList from "../components/Recordings/useRecordingsList";
import "./RecordingsPage.css";

/** Master only: computers without a clinic, whose recordings wait in quarantine. */
function UnassignedBanner() {
  const { t } = useTranslation("uploads");
  const { user } = useUser();
  const isMaster = user?.role_id === 1;
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isMaster) return undefined;
    let live = true;
    fetchUploadSummary()
      .then((s) => { if (live) setCount(Number(s?.unassigned_devices) || 0); })
      .catch(() => {});
    return () => { live = false; };
  }, [isMaster]);

  if (!isMaster || count < 1) return null;
  return (
    <div className="recpage-banner" role="status" data-testid="recordings-unassigned-banner">
      <Icon name="alert" />
      <span>{t("recordings.banner", { count })}</span>
      <Button as={Link} to="/clinics" size="sm">{t("recordings.bannerAction")}</Button>
    </div>
  );
}

export default function RecordingsPage() {
  const { t } = useTranslation("uploads");
  const list = useRecordingsList();

  return (
    <div className="recpage" data-testid="recordings-page">
      <PageHeader
        title={t("recordings.title")}
        sub={t("recordings.sub")}
        actions={(
          <>
            <Menu
              label={t("recordings.more")}
              items={[{ label: t("list.exportCsv"), icon: "file", onSelect: list.exportCsv }]}
            />
            <DownloadButton list={list} />
          </>
        )}
      />
      <UnassignedBanner />
      <RecordingsTable list={list} showKpis />
    </div>
  );
}
