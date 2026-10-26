// Master-only dialogs for one computer: assign / move to a clinic, and rename.
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Modal, Select, TextField, useToast } from "../../components/ui";
import { fetchSites } from "../../api/sites";
import { assignDeviceSite, renameDevice } from "../../api/devices";
import { apiErrorMessage } from "../../utils/apiError";
import { computerName } from "./clinicLogic";

export function AssignComputerModal({ device, onClose, onDone }) {
  const { t } = useTranslation("clinics");
  const { t: tc } = useTranslation();
  const toast = useToast();
  const [sites, setSites] = useState([]);
  const [siteId, setSiteId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!device) return;
    setSiteId("");
    fetchSites().then((s) => setSites(Array.isArray(s) ? s : [])).catch(() => setSites([]));
  }, [device]);

  const assign = async () => {
    setBusy(true);
    try {
      const res = await assignDeviceSite(device.id, Number(siteId));
      toast.success(t("assign.done", { count: res.moved ?? 0 }));
      onDone?.();
      onClose();
    } catch (err) {
      toast.error(apiErrorMessage(err, tc));
    } finally {
      setBusy(false);
    }
  };

  const choices = sites.filter((s) => s.id !== device?.siteId);
  return (
    <Modal
      open={!!device}
      onClose={onClose}
      dismissible={!busy}
      title={device?.siteId == null ? t("assign.title") : t("assign.titleMove")}
      description={device?.siteId == null ? t("assign.desc") : t("assign.descMove")}
      data-testid="assign-computer-modal"
      footer={(
        <>
          <Button onClick={onClose} disabled={busy}>{t("cancel")}</Button>
          <Button variant="primary" onClick={assign} disabled={busy || !siteId} data-testid="assign-computer-confirm">{t("assign.confirm")}</Button>
        </>
      )}
    >
      {device && <p className="clinics-sub">{t("assign.computer")}: <span className="clinics-mono" title={device.installationId}>{computerName(device)}</span></p>}
      <Select label={t("assign.clinic")} value={siteId} onChange={(e) => setSiteId(e.target.value)} data-testid="assign-computer-clinic">
        <option value="">{t("assign.choose")}</option>
        {choices.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </Select>
    </Modal>
  );
}

export function RenameComputerModal({ device, onClose, onDone }) {
  const { t } = useTranslation("clinics");
  const { t: tc } = useTranslation();
  const toast = useToast();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (device) setValue(device.label || ""); }, [device]);

  const save = async (e) => {
    e?.preventDefault();
    setBusy(true);
    try {
      await renameDevice(device.id, value.trim());
      toast.success(t("rename.done"));
      onDone?.();
      onClose();
    } catch (err) {
      toast.error(apiErrorMessage(err, tc));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!device}
      onClose={onClose}
      dismissible={!busy}
      title={t("rename.title")}
      data-testid="rename-computer-modal"
      footer={(
        <>
          <Button onClick={onClose} disabled={busy}>{t("cancel")}</Button>
          <Button variant="primary" type="submit" form="rename-computer-form" disabled={busy}>{t("save")}</Button>
        </>
      )}
    >
      <form id="rename-computer-form" onSubmit={save}>
        <TextField
          label={t("rename.label")}
          value={value}
          maxLength={255}
          placeholder={device?.installationId}
          onChange={(e) => setValue(e.target.value)}
          help={t("rename.help")}
          data-testid="rename-computer-input"
        />
      </form>
    </Modal>
  );
}
