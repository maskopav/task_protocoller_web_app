import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Button, Select, useToast } from "../ui";
import { fetchSites } from "../../api/sites";
import { fetchDevices, assignDeviceSite } from "../../api/devices";
import "./Recording.css";

/** The amber strip of a quarantined recording (F-043). */
export function QuarantineBanner() {
  const { t } = useTranslation("recording");
  return (
    <div className="recd-banner" role="status" data-testid="recording-quarantine">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3 2 20h20L12 3z" /><path d="M12 10v5" /><path d="M12 18h.01" />
      </svg>
      <p><strong>{t("quarantine.title")}</strong> {t("quarantine.body")}</p>
    </div>
  );
}

/**
 * "Assign computer…" for a master: pick a clinic and assign the recording's computer to it
 * through the existing device API (PUT /devices/:id/site). The server releases the quarantined
 * recordings of that computer for checking.
 */
export function AssignComputerModal({ open, onClose, installationId, onAssigned }) {
  const { t } = useTranslation("recording");
  const toast = useToast();
  const [sites, setSites] = useState([]);
  const [siteId, setSiteId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSiteId("");
    fetchSites().then((s) => setSites(Array.isArray(s) ? s : [])).catch(() => setSites([]));
  }, [open]);

  const assign = async () => {
    setBusy(true);
    try {
      const list = await fetchDevices();
      const device = (list.devices || []).find((d) => d.installationId === installationId);
      if (!device) throw new Error("not_found");
      const res = await assignDeviceSite(device.id, Number(siteId));
      toast.success(t("quarantine.done", { count: res.moved ?? 0 }));
      onClose();
      onAssigned?.();
    } catch (e) {
      toast.error(e.message === "not_found" ? t("quarantine.notFound") : t("quarantine.failed", { code: e.message }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!busy}
      title={t("quarantine.modalTitle")}
      description={t("quarantine.modalDesc")}
      footer={(
        <>
          <Button onClick={onClose} disabled={busy}>{t("quarantine.cancel")}</Button>
          <Button variant="primary" onClick={assign} disabled={busy || !siteId} data-testid="assign-confirm">{t("quarantine.confirm")}</Button>
        </>
      )}
    >
      <Select label={t("quarantine.clinic")} value={siteId} onChange={(e) => setSiteId(e.target.value)} data-testid="assign-clinic">
        <option value="">{t("quarantine.choose")}</option>
        {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </Select>
    </Modal>
  );
}
