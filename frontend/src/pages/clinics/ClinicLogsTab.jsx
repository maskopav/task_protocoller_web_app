// Clinic › Logs (master only): the log files the clinic's computers sent, grouped by computer
// (docs/device_logs/01_spec.md §6).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, DataTable, EmptyState, Section, useToast } from "../../components/ui";
import { fetchDeviceLogs, viewDeviceLog, downloadDeviceLog } from "../../api/deviceLogs";
import { formatDateTime } from "../../utils/formatDate";
import { apiErrorMessage } from "../../utils/apiError";
import { formatBytes, groupLogsByComputer } from "./clinicLogic";
import "./clinics.css";

export default function ClinicLogsTab({ site }) {
  const { t } = useTranslation("clinics");
  const { t: tc } = useTranslation();
  const toast = useToast();
  const [logs, setLogs] = useState(null); // null while loading

  useEffect(() => {
    let live = true;
    setLogs(null);
    fetchDeviceLogs(site.id)
      .then((r) => live && setLogs(r.logs || []))
      .catch((err) => { if (live) { setLogs([]); toast.error(apiErrorMessage(err, tc)); } });
    return () => { live = false; };
  }, [site.id, toast, tc]);

  const groups = useMemo(() => groupLogsByComputer(logs || []), [logs]);

  const run = useCallback(async (action, id) => {
    try { await action(id); } catch (err) { toast.error(apiErrorMessage(err, tc)); }
  }, [toast, tc]);

  const columns = [
    { key: "fileName", header: t("logs.columns.file"), primary: true, render: (l) => <span className="clinics-mono">{l.fileName}</span> },
    { key: "bytes", header: t("logs.columns.size"), align: "num", render: (l) => formatBytes(l.bytes) },
    { key: "receivedAt", header: t("logs.columns.received"), render: (l) => formatDateTime(l.receivedAt) },
    { key: "utcOffset", header: t("logs.columns.offset"), render: (l) => <span className="clinics-mono">{l.utcOffset}</span> },
    { key: "appVersion", header: t("logs.columns.version"), render: (l) => l.appVersion },
    {
      key: "actions", header: "", align: "end",
      render: (l) => (
        <span>
          <Button size="sm" variant="quiet" onClick={() => run(viewDeviceLog, l.id)} data-testid={`log-view-${l.id}`}>{t("logs.view")}</Button>
          <Button size="sm" variant="quiet" onClick={() => run(downloadDeviceLog, l.id)} data-testid={`log-download-${l.id}`}>{t("logs.download")}</Button>
        </span>
      ),
    },
  ];

  if (logs === null) return <EmptyState title={t("loading")} />;
  if (groups.length === 0) {
    return <EmptyState icon="computer" title={t("logs.emptyTitle")} description={t("logs.emptyBody")} data-testid="clinic-logs-empty" />;
  }
  return (
    <div data-testid="clinic-logs">
      {groups.map((g) => (
        <Section key={g.deviceId} title={g.name} hint={g.label ? g.installationId : undefined} data-testid={`clinic-logs-computer-${g.deviceId}`}>
          <DataTable caption={g.name} columns={columns} rows={g.logs} />
        </Section>
      ))}
    </div>
  );
}
