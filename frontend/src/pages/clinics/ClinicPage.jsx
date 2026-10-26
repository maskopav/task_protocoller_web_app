// src/pages/clinics/ClinicPage.jsx — one clinic with its tabs (docs/ui_redesign/02_spec.md §6.7).
// Studies · Computers · Recordings · Settings. The page owns the data; each tab renders a part of it.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useOutletContext, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useUser } from "../../context/UserContext";
import { Badge, Button, EmptyState, PageHeader, Tabs, useToast } from "../../components/ui";
import RecordingsTable from "../../components/Recordings/RecordingsTable";
import { fetchSiteById } from "../../api/sites";
import { fetchDevices } from "../../api/devices";
import { fetchProjectsList } from "../../api/projects";
import { fetchUploadSummary } from "../../api/uploads";
import { apiErrorMessage } from "../../utils/apiError";
import NotFoundPage from "../NotFoundPage";
import ClinicStudiesTab from "./ClinicStudiesTab";
import ClinicComputersTab from "./ClinicComputersTab";
import ClinicSettingsTab, { SETTINGS_FORM_ID } from "./ClinicSettingsTab";
import "./clinics.css";

const TABS = ["studies", "computers", "recordings", "settings"];

export default function ClinicPage() {
  const { siteId, tab } = useParams();
  const { t } = useTranslation("clinics");
  const { t: tc } = useTranslation();
  const { user } = useUser();
  const toast = useToast();
  const shell = useOutletContext();
  const isMaster = user?.role_id === 1;

  const [site, setSite] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ready | missing
  const [devices, setDevices] = useState([]);
  const [summary, setSummary] = useState(null);
  const [studies, setStudies] = useState([]);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setSite(await fetchSiteById(siteId));
      setStatus("ready");
    } catch (err) {
      if (err?.status === 404 || err?.code === "not_found") setStatus("missing");
      else { setStatus((s) => (s === "loading" ? "missing" : s)); toast.error(apiErrorMessage(err, tc)); }
      return;
    }
    const [devs, sum, list] = await Promise.all([
      fetchDevices({ siteId }).then((d) => d.devices || []).catch(() => []),
      fetchUploadSummary({ siteId }).catch(() => null),
      fetchProjectsList().catch(() => []),
    ]);
    setDevices(devs);
    setSummary(sum);
    setStudies(Array.isArray(list) ? list : []);
  }, [siteId, toast, tc]);

  useEffect(() => { setStatus("loading"); setSite(null); load(); }, [load]);

  const addable = useMemo(() => {
    const here = new Set((site?.projects || []).map((p) => p.id));
    return studies.filter((s) => s.can_edit && !here.has(s.project_id));
  }, [site, studies]);
  const canEditAny = studies.some((s) => s.can_edit);

  if (!tab) return <Navigate to="studies" replace />;
  if (!TABS.includes(tab)) return <Navigate to={`/clinics/${siteId}/studies`} replace />;
  if (status === "missing") return <NotFoundPage />;
  if (status === "loading" || !site) return <div className="clinics-page"><EmptyState title={t("loading")} /></div>;

  const base = `/clinics/${site.id}`;
  const single = shell?.singleClinic?.id === site.id;
  const active = site.is_active !== 0;
  const sub = [site.country, site.contact_persons && t("header.contact", { who: site.contact_persons })].filter(Boolean).join(" · ");

  let action = null;
  if (tab === "studies" && canEditAny && active) {
    action = <Button variant="primary" icon="plus" onClick={() => setAddOpen(true)} data-testid="clinic-add-study">{t("studies.addStudy")}</Button>;
  } else if (tab === "settings" && site.can_edit) {
    action = <Button variant="primary" type="submit" form={SETTINGS_FORM_ID} data-testid="clinic-settings-save">{t("settings.save")}</Button>;
  }

  return (
    <div className="clinics-page" data-testid="clinic-page">
      <PageHeader
        breadcrumbs={single ? undefined : [{ label: t("list.title"), to: "/clinics" }, { label: site.name }]}
        title={site.name}
        badges={<Badge tone={active ? "ok" : "neutral"}>{active ? t("header.active") : t("header.inactive")}</Badge>}
        sub={sub || undefined}
        actions={action}
      />
      <Tabs
        label={site.name}
        items={[
          { to: `${base}/studies`, label: t("tabs.studies"), count: site.projects?.length ?? 0, testId: "clinic-tab-studies" },
          { to: `${base}/computers`, label: t("tabs.computers"), count: devices.length, testId: "clinic-tab-computers" },
          { to: `${base}/recordings`, label: t("tabs.recordings"), count: summary?.total, testId: "clinic-tab-recordings" },
          { to: `${base}/settings`, label: t("tabs.settings"), testId: "clinic-tab-settings" },
        ]}
      />
      {tab === "studies" && (
        <ClinicStudiesTab
          site={site} canAddAny={canEditAny} onChanged={load}
          addOpen={addOpen} onAddClose={() => setAddOpen(false)} addable={addable}
        />
      )}
      {tab === "computers" && <ClinicComputersTab site={site} devices={devices} isMaster={isMaster} onChanged={load} />}
      {tab === "recordings" && <RecordingsTable fixed={{ clinic: site.id }} />}
      {tab === "settings" && <ClinicSettingsTab site={site} onSaved={load} />}
    </div>
  );
}
