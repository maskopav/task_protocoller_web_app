// src/pages/studies/tabs/ClinicsTab.jsx — "Runs at": the clinics this study runs at, with a switch per clinic.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchSites } from "../../../api/sites";
import { fetchUploadSummary } from "../../../api/uploads";
import { removeRunsAt, setRunsAt } from "../../../api/projects";
import { useConfirm, useToast } from "../../../components/ui";
import { RunsAtList } from "../../../components/RunsAt";
import { clinicRows } from "../studyHelpers";

export default function ClinicsTab({ study, onChanged }) {
  const { t } = useTranslation("studies");
  const toast = useToast();
  const confirm = useConfirm();
  const projectId = study.project_id;

  const [clinics, setClinics] = useState(null);
  const [onIds, setOnIds] = useState([]);
  const [recordings, setRecordings] = useState({});

  useEffect(() => {
    let live = true;
    Promise.all([
      fetchSites(),
      fetchSites(projectId),
      fetchUploadSummary({ projectId }).catch(() => null),
    ]).then(([all, running, summary]) => {
      if (!live) return;
      setClinics(all);
      setOnIds(running.map((c) => c.id));
      setRecordings(Object.fromEntries((summary?.bySite || []).map((r) => [r.id, r.count])));
    }).catch((err) => {
      if (!live) return;
      setClinics([]);
      toast.error(err?.message || t("clinics.loadError"));
    });
    return () => { live = false; };
    // toast and t are stable for this load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const rows = useMemo(
    () => clinicRows(clinics, onIds, recordings, {
      subtitle: (n) => t("clinics.recordings", { count: n }),
      href: (c) => `/clinics/${c.id}`,
    }),
    [clinics, onIds, recordings, t],
  );

  const onToggle = useCallback(async (row, next) => {
    if (!next) {
      const ok = await confirm({
        title: t("clinics.stopTitle", { name: row.title }),
        message: t("clinics.stopMessage", { name: row.title }),
        confirmText: t("clinics.stop"),
        cancelText: t("cancel"),
        danger: true,
      });
      if (!ok) return;
      await removeRunsAt(projectId, row.key);
      setOnIds((ids) => ids.filter((x) => x !== row.key));
    } else {
      await setRunsAt(projectId, row.key);
      setOnIds((ids) => [...ids, row.key]);
      toast.success(t("clinics.nowRuns", { name: row.title }));
    }
    onChanged?.();
  }, [confirm, onChanged, projectId, t, toast]);

  if (clinics === null) return <div className="studies-skeleton" aria-busy="true" aria-label={t("loading")} />;

  return (
    <div data-testid="study-clinics">
      <p className="studies-lead">{t("clinics.lead")}</p>
      <RunsAtList rows={rows} onToggle={onToggle} emptyText={t("clinics.empty")} testId="study-runs-at" />
    </div>
  );
}
