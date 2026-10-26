// src/pages/clinics/ClinicsListPage.jsx — "Where my studies run" (docs/ui_redesign/02_spec.md §6.6).
// Master only: the "Unassigned computers" section above the table replaces the old Devices page.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useUser } from "../../context/UserContext";
import { Button, DataTable, EmptyState, PageHeader, Section, StatusDot, useToast } from "../../components/ui";
import { fetchSites } from "../../api/sites";
import { fetchDevices } from "../../api/devices";
import { fetchUploadSummary } from "../../api/uploads";
import { formatRelative } from "../../utils/formatDate";
import { apiErrorMessage } from "../../utils/apiError";
import NewClinicModal from "./NewClinicModal";
import { AssignComputerModal } from "./ComputerModals";
import { computerName, summariseByClinic } from "./clinicLogic";
import "./clinics.css";

export default function ClinicsListPage() {
  const { t } = useTranslation("clinics");
  const { t: tc } = useTranslation();
  const { user } = useUser();
  const navigate = useNavigate();
  const toast = useToast();
  const isMaster = user?.role_id === 1;
  const canCreate = isMaster || !!user?.can_create_sites;

  const [sites, setSites] = useState(null);
  const [devices, setDevices] = useState([]);
  const [activity, setActivity] = useState({}); // siteId -> {lastUpload, unreviewed}
  const [creating, setCreating] = useState(false);
  const [assigning, setAssigning] = useState(null);

  const load = useCallback(async () => {
    try {
      const list = await fetchSites();
      setSites(Array.isArray(list) ? list : []);
      const [devs, perClinic] = await Promise.all([
        fetchDevices().then((d) => d.devices || []).catch(() => []),
        Promise.all(list.map((s) => fetchUploadSummary({ siteId: s.id }).then((x) => [s.id, x]).catch(() => [s.id, null]))),
      ]);
      setDevices(devs);
      setActivity(Object.fromEntries(perClinic.map(([id, x]) => [id, x ? { lastUpload: x.lastUpload, unreviewed: x.unreviewed } : null])));
    } catch (err) {
      setSites((s) => s ?? []);
      toast.error(apiErrorMessage(err, tc));
    }
  }, [toast, tc]);

  useEffect(() => { load(); }, [load]);

  const byClinic = useMemo(() => summariseByClinic(devices), [devices]);
  const unassigned = useMemo(() => devices.filter((d) => d.siteId == null), [devices]);

  const columns = [
    { key: "name", header: t("list.columns.name"), primary: true, sortable: true, render: (s) => s.name },
    { key: "country", header: t("list.columns.country"), sortable: true, render: (s) => s.country || <span className="clinics-muted">—</span> },
    {
      key: "studies", header: t("list.columns.studies"), align: "num", sortValue: (s) => Number(s.project_count) || 0,
      render: (s) => (Number(s.project_count) ? s.project_count : <span className="clinics-muted">{t("list.none")}</span>),
    },
    {
      key: "computers", header: t("list.columns.computers"), align: "num", sortValue: (s) => byClinic.get(s.id)?.count || 0,
      render: (s) => {
        const c = byClinic.get(s.id);
        if (!c) return <span className="clinics-muted">{t("list.none")}</span>;
        return <StatusDot tone={c.tone === "ok" ? "idle" : c.tone}>{c.count}</StatusDot>;
      },
    },
    {
      key: "lastUpload", header: t("list.columns.lastUpload"),
      sortValue: (s) => activity[s.id]?.lastUpload || "",
      render: (s) => (activity[s.id]?.lastUpload ? formatRelative(activity[s.id].lastUpload) : <span className="clinics-muted">—</span>),
    },
    {
      key: "unreviewed", header: t("list.columns.unreviewed"), align: "num", sortValue: (s) => activity[s.id]?.unreviewed || 0,
      render: (s) => (activity[s.id] ? activity[s.id].unreviewed : <span className="clinics-muted">—</span>),
    },
  ];

  return (
    <div className="clinics-page" data-testid="clinics-page">
      <PageHeader
        title={t("list.title")}
        sub={t("list.sub")}
        actions={canCreate ? <Button variant="primary" icon="plus" onClick={() => setCreating(true)} data-testid="new-clinic">{t("list.new")}</Button> : null}
      />

      {isMaster && unassigned.length > 0 && (
        <section className="clinics-unassigned" id="unassigned-computers" data-testid="unassigned-computers">
          <Section title={t("unassigned.title", { count: unassigned.length })} hint={t("unassigned.hint")}>
            <DataTable
              data-testid="unassigned-table"
              caption={t("unassigned.title", { count: unassigned.length })}
              rows={unassigned}
              columns={[
                {
                  key: "name", header: t("computers.columns.computer"), primary: true,
                  render: (d) => (
                    <div>
                      <span>{computerName(d)}</span>
                      {d.label && <span className="clinics-sub clinics-mono" title={d.installationId}>{d.installationId.slice(0, 8)}…</span>}
                    </div>
                  ),
                },
                { key: "version", header: t("computers.columns.version"), render: (d) => d.appVersion || <span className="clinics-muted">—</span> },
                { key: "seen", header: t("computers.columns.lastSeen"), render: (d) => (d.lastSeenAt ? formatRelative(d.lastSeenAt) : <span className="clinics-muted">—</span>) },
                {
                  key: "actions", header: "", align: "end",
                  render: (d) => <Button size="sm" onClick={() => setAssigning(d)} data-testid={`assign-${d.id}`}>{t("unassigned.assign")}</Button>,
                },
              ]}
            />
          </Section>
        </section>
      )}

      {sites === null ? (
        <EmptyState title={t("loading")} />
      ) : (
        <DataTable
          data-testid="clinics-table"
          caption={t("list.title")}
          columns={columns}
          rows={sites}
          href={(s) => `/clinics/${s.id}`}
          defaultSort={{ key: "name", dir: "asc" }}
          empty={<EmptyState icon="clinic" title={t("list.emptyTitle")} description={t("list.emptyBody")} data-testid="clinics-empty" />}
          rowClassName={(s) => `clinic-row-${s.id}`}
        />
      )}

      <NewClinicModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(id) => { setCreating(false); if (id) navigate(`/clinics/${id}/computers`); else load(); }}
      />
      <AssignComputerModal device={assigning} onClose={() => setAssigning(null)} onDone={load} />
    </div>
  );
}
