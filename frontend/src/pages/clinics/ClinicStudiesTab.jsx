// Clinic › Studies: the studies running here, and "What the computers receive" (F-014).
import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button, Modal, Section, Select, useConfirm, useToast } from "../../components/ui";
import { RunsAtList } from "../../components/RunsAt";
import { removeRunsAt, setRunsAt } from "../../api/projects";
import { countReceivedProtocols } from "../../api/sites";
import { apiErrorMessage } from "../../utils/apiError";
import "./clinics.css";

/** Every protocol once, with its language chips and version, grouped by study. */
export function WhatComputersReceive({ site }) {
  const { t } = useTranslation("clinics");
  const receives = useMemo(() => site.receives || [], [site.receives]);
  const count = countReceivedProtocols(site);
  const languages = useMemo(() => {
    const set = new Set();
    receives.forEach((s) => s.protocols.forEach((p) => p.languages.forEach((l) => set.add(l))));
    return [...set].sort();
  }, [receives]);

  return (
    <Section title={t("receives.title")} hint={t("receives.hint")} data-testid="clinic-receives">
      {count === 0 ? (
        <p className="clinics-summary" data-testid="clinic-receives-empty">{t("receives.empty")}</p>
      ) : (
        <div className="clinics-receives">
          {receives.map((study) => (
            <div key={study.project_id} className="clinics-receives-study" data-testid={`clinic-receives-study-${study.project_id}`}>
              <h4>{study.project_name}</h4>
              <ul className="clinics-receives-list">
                {study.protocols.map((p) => (
                  <li key={p.protocol_id} data-testid={`clinic-receives-protocol-${p.protocol_id}`}>
                    <span>{p.name}</span>
                    <span className="clinics-chips">
                      {p.languages.map((l) => <Badge key={l} tone="outline">{l.toUpperCase()}</Badge>)}
                    </span>
                    {p.version != null && <span className="clinics-muted">v{p.version}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="clinics-summary" data-testid="clinic-receives-summary">
            {t("receives.summary", { count, languages: languages.map((l) => l.toUpperCase()).join(", ") })}
          </p>
        </div>
      )}
    </Section>
  );
}

export default function ClinicStudiesTab({ site, canAddAny, onChanged, addOpen, onAddClose, addable }) {
  const { t } = useTranslation("clinics");
  const { t: tc } = useTranslation();
  const confirm = useConfirm();
  const toast = useToast();
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);

  const rows = (site.projects || []).map((p) => ({
    key: p.id,
    title: p.name,
    subtitle: [p.can_edit ? t("studies.yours") : t("studies.received"), p.is_active ? null : t("studies.archived")].filter(Boolean).join(" · "),
    on: true,
    href: `/studies/${p.id}`,
    disabled: !p.can_edit,
    disabledReason: !p.can_edit ? t("studies.receivedReason") : undefined,
  }));

  const stop = async (row) => {
    const ok = await confirm({
      title: t("studies.stopTitle", { study: row.title, clinic: site.name }),
      message: t("studies.stopBody"),
      confirmText: t("studies.stop"),
      danger: true,
    });
    if (!ok) return;
    await removeRunsAt(row.key, site.id);
    toast.success(t("studies.stopped"));
    await onChanged();
  };

  const add = async () => {
    setBusy(true);
    try {
      await setRunsAt(Number(pick), site.id);
      toast.success(t("studies.added"));
      setPick("");
      onAddClose();
      await onChanged();
    } catch (err) {
      toast.error(apiErrorMessage(err, tc));
    } finally {
      setBusy(false);
    }
  };

  const closeAdd = () => { if (!busy) { setPick(""); onAddClose(); } };

  return (
    <>
      <Section title={t("studies.title")} hint={canAddAny ? undefined : t("studies.readOnlyHint")}>
        <RunsAtList
          rows={rows}
          onToggle={(row, next) => (next ? Promise.resolve() : stop(row))}
          emptyText={t("studies.empty")}
          testId="clinic-studies"
        />
      </Section>
      <WhatComputersReceive site={site} />
      <Modal
        open={!!addOpen}
        onClose={closeAdd}
        dismissible={!busy}
        title={t("studies.addTitle", { clinic: site.name })}
        description={t("studies.addDesc")}
        data-testid="add-study-modal"
        footer={(
          <>
            <Button onClick={closeAdd} disabled={busy}>{t("cancel")}</Button>
            <Button variant="primary" onClick={add} disabled={busy || !pick} data-testid="add-study-confirm">{t("studies.add")}</Button>
          </>
        )}
      >
        {addable.length === 0 ? (
          <p>{t("studies.nothingToAdd")}</p>
        ) : (
          <Select label={t("studies.study")} value={pick} onChange={(e) => setPick(e.target.value)} data-testid="add-study-select">
            <option value="">{t("studies.choose")}</option>
            {addable.map((s) => <option key={s.project_id} value={s.project_id}>{s.project_name}</option>)}
          </Select>
        )}
      </Modal>
    </>
  );
}
