// Clinic › Computers: the connection card (server address + access token) and the clinic's computers.
import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button, CopyField, DataTable, EmptyState, Menu, Section, StatusDot, useConfirm, useToast } from "../../components/ui";
import { updateSite } from "../../api/sites";
import { formatDateTime, formatRelative } from "../../utils/formatDate";
import { apiErrorMessage } from "../../utils/apiError";
import { AssignComputerModal, RenameComputerModal } from "./ComputerModals";
import { compareVersions, computerName, computerStatus, generateAccessToken, newestVersion, sortComputers } from "./clinicLogic";
import { absoluteApiAddress } from "../../utils/serverAddress";
import "./clinics.css";

const API_ADDRESS = absoluteApiAddress(import.meta.env.VITE_API_BASE);

function ConnectionCard({ site, isMaster, onChanged }) {
  const { t } = useTranslation("clinics");
  const { t: tc } = useTranslation();
  const confirm = useConfirm();
  const toast = useToast();
  const [shown, setShown] = useState(false);

  const rotate = async () => {
    const ok = await confirm({
      title: t("connection.rotateTitle"),
      message: t("connection.rotateWarning"),
      confirmText: t("connection.rotateConfirm"),
      danger: true,
    });
    if (!ok) return;
    try {
      await updateSite(site.id, { access_token: generateAccessToken() });
      toast.success(t("connection.rotated"));
      await onChanged();
    } catch (err) {
      toast.error(apiErrorMessage(err, tc));
    }
  };

  return (
    <Section title={t("connection.title")} hint={t("connection.hint")}>
      <div className="clinics-card" data-testid="clinic-connection">
        {API_ADDRESS && (
          <dl className="clinics-field-pair">
            <dt>{t("connection.server")}</dt>
            <dd><CopyField value={API_ADDRESS} label={t("connection.server")} /></dd>
          </dl>
        )}
        {isMaster ? (
          <dl className="clinics-field-pair">
            <dt>{t("connection.token")}</dt>
            <dd>
              <div className="clinics-token">
                <span className="clinics-token-field" data-testid="clinic-token"><CopyField value={site.access_token || ""} masked={!shown} label={t("connection.token")} /></span>
                <Button size="sm" variant="quiet" onClick={() => setShown((s) => !s)} aria-pressed={shown} data-testid="clinic-token-toggle">
                  {shown ? t("connection.hide") : t("connection.show")}
                </Button>
                <Button size="sm" onClick={rotate} data-testid="clinic-token-rotate">{t("connection.rotate")}</Button>
              </div>
            </dd>
          </dl>
        ) : (
          <p data-testid="clinic-token-ask">{t("connection.askAdmin")}</p>
        )}
      </div>
    </Section>
  );
}

export default function ClinicComputersTab({ site, devices, isMaster, onChanged }) {
  const { t } = useTranslation("clinics");
  const [renaming, setRenaming] = useState(null);
  const [moving, setMoving] = useState(null);
  const rows = useMemo(() => sortComputers(devices), [devices]);
  const newest = useMemo(() => newestVersion(devices), [devices]);

  const columns = [
    {
      key: "name", header: t("computers.columns.computer"), primary: true,
      render: (d) => (
        <div>
          <span>{computerName(d)}</span>
          {d.label && <span className="clinics-sub clinics-mono" title={d.installationId}>{d.installationId.slice(0, 8)}…</span>}
        </div>
      ),
    },
    {
      key: "status", header: t("computers.columns.status"),
      render: (d) => {
        const s = computerStatus(d);
        return <StatusDot tone={s.tone} data-testid={`computer-status-${d.id}`}>{t(`computers.status.${s.key}`)}</StatusDot>;
      },
    },
    {
      key: "version", header: t("computers.columns.version"),
      render: (d) => (
        <span>
          {d.appVersion || <span className="clinics-muted">—</span>}
          {d.appVersion && newest && compareVersions(d.appVersion, newest) < 0 && <> <Badge tone="warn">{t("computers.update")}</Badge></>}
        </span>
      ),
    },
    {
      key: "config", header: t("computers.columns.config"),
      render: (d) => (d.lastConfigVersion != null && d.lastConfigVersion !== ""
        ? <span title={d.lastConfigAt ? formatDateTime(d.lastConfigAt) : undefined} data-testid={`computer-config-${d.id}`}>{d.lastConfigVersion}</span>
        : <span className="clinics-muted" data-testid={`computer-config-${d.id}`}>—</span>),
    },
    {
      key: "lastSeen", header: t("computers.columns.lastSeen"),
      render: (d) => (d.lastSeenAt
        ? <span title={formatDateTime(d.lastSeenAt)}>{formatRelative(d.lastSeenAt)}</span>
        : <span className="clinics-muted">—</span>),
    },
    {
      key: "pending", header: t("computers.columns.pending"), align: "num",
      render: (d) => (d.backlogHidden
        ? <span className="clinics-muted" title={t("computers.hiddenHint")}>—</span>
        : d.pending),
    },
    ...(isMaster ? [{
      key: "actions", header: "", align: "end",
      render: (d) => (
        <Menu
          label={t("computers.actions", { name: computerName(d) })}
          items={[
            { label: t("computers.rename"), icon: "settings", onSelect: () => setRenaming(d) },
            { label: t("computers.move"), icon: "clinic", onSelect: () => setMoving(d) },
          ]}
        />
      ),
    }] : []),
  ];

  return (
    <>
      <ConnectionCard site={site} isMaster={isMaster} onChanged={onChanged} />
      <Section title={t("computers.title")} hint={t("computers.hint")}>
        <DataTable
          data-testid="clinic-computers-table"
          caption={t("computers.title")}
          columns={columns}
          rows={rows}
          rowClassName={(d) => `computer-row-${d.id}`}
          empty={<EmptyState icon="computer" title={t("computers.emptyTitle")} description={t("computers.emptyBody")} data-testid="clinic-computers-empty" />}
        />
      </Section>
      <RenameComputerModal device={renaming} onClose={() => setRenaming(null)} onDone={onChanged} />
      <AssignComputerModal device={moving} onClose={() => setMoving(null)} onDone={onChanged} />
    </>
  );
}
