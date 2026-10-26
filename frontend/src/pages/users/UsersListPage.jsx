// src/pages/users/UsersListPage.jsx — all users, master only (docs/ui_redesign/02_spec.md section 6.8).
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Badge, Button, DataTable, EmptyState, Modal, PageHeader, StatusDot, TextField, useToast } from "../../components/ui";
import { createAdminApi, fetchAllAdmins } from "../../api/users";
import { apiErrorMessage } from "../../utils/apiError";
import { isMasterUser, profileError } from "./userLogic";
import "./users.css";

function InviteModal({ open, onClose, onCreated }) {
  const { t, i18n } = useTranslation("users");
  const { t: ta } = useTranslation("admin");
  const [form, setForm] = useState({ name: "", email: "" });
  const [failure, setFailure] = useState({});
  const [saving, setSaving] = useState(false);

  const close = () => {
    if (saving) return;
    setForm({ name: "", email: "" });
    setFailure({});
    onClose();
  };

  const submit = async (e) => {
    e.preventDefault();
    const key = profileError(form);
    if (key) {
      setFailure(key === "nameRequired" ? { name: t(`errors.${key}`) } : { email: t(`errors.${key}`) });
      return;
    }
    setSaving(true);
    setFailure({});
    try {
      const res = await createAdminApi({ name: form.name.trim(), email: form.email.trim(), lang: i18n.language });
      setForm({ name: "", email: "" });
      onCreated(res?.id);
    } catch (err) {
      setFailure({ email: err?.code === "email_taken" ? t("errors.emailTaken") : apiErrorMessage(err, ta) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      dismissible={!saving}
      title={t("invite.title")}
      description={t("invite.description")}
      data-testid="invite-user-modal"
      footer={(
        <>
          <Button onClick={close} disabled={saving}>{t("cancel")}</Button>
          <Button variant="primary" type="submit" form="invite-user-form" disabled={saving} data-testid="invite-user-submit">{t("invite.submit")}</Button>
        </>
      )}
    >
      <form id="invite-user-form" onSubmit={submit} noValidate className="users-card">
        <TextField
          label={t("fields.name")} value={form.name} data-autofocus data-testid="invite-user-name"
          onChange={(e) => { setForm({ ...form, name: e.target.value }); setFailure({}); }} error={failure.name}
        />
        <TextField
          label={t("fields.email")} type="email" value={form.email} placeholder="name@example.org" data-testid="invite-user-email"
          onChange={(e) => { setForm({ ...form, email: e.target.value }); setFailure({}); }} error={failure.email}
        />
      </form>
    </Modal>
  );
}

export default function UsersListPage() {
  const { t } = useTranslation("users");
  const { t: tc } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [users, setUsers] = useState(null);
  const [inviting, setInviting] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await fetchAllAdmins();
      setUsers(Array.isArray(list) ? list : []);
    } catch (err) {
      setUsers((u) => u ?? []);
      toast.error(apiErrorMessage(err, tc));
    }
  }, [toast, tc]);

  useEffect(() => { load(); }, [load]);

  const columns = [
    {
      key: "name", header: t("columns.name"), primary: true, sortable: true,
      sortValue: (u) => (u.name || u.email || "").toLowerCase(),
      render: (u) => u.name || <span className="users-muted">—</span>,
    },
    { key: "email", header: t("columns.email"), sortable: true, render: (u) => u.email },
    {
      key: "clinics", header: t("columns.clinics"),
      render: (u) => {
        if (isMasterUser(u)) return <Badge tone="accent">{t("allClinics")}</Badge>;
        if (!u.sites?.length) return <span className="users-muted">{t("noClinics")}</span>;
        return (
          <span className="users-chips">
            {u.sites.map((s) => <Badge key={s.id}>{s.name}</Badge>)}
          </span>
        );
      },
    },
    {
      key: "canCreate", header: t("columns.canCreate"),
      render: (u) => {
        const parts = [u.can_create_projects && t("canCreate.studies"), u.can_create_sites && t("canCreate.clinics")].filter(Boolean);
        return parts.length ? parts.join(", ") : <span className="users-muted">—</span>;
      },
    },
    {
      key: "status", header: t("columns.status"), sortValue: (u) => (u.is_active ? 0 : 1),
      render: (u) => <StatusDot tone={u.is_active ? "ok" : "idle"}>{u.is_active ? t("active") : t("disabled")}</StatusDot>,
    },
  ];

  return (
    <div className="users-page" data-testid="users-page">
      <PageHeader
        title={t("list.title")}
        sub={t("list.sub")}
        actions={<Button variant="primary" icon="plus" onClick={() => setInviting(true)} data-testid="new-user">{t("list.new")}</Button>}
      />
      {users === null ? (
        <EmptyState title={t("loading")} />
      ) : (
        <DataTable
          data-testid="users-table"
          caption={t("list.title")}
          columns={columns}
          rows={users}
          href={(u) => `/users/${u.id}`}
          defaultSort={{ key: "name", dir: "asc" }}
          empty={<EmptyState icon="users" title={t("list.emptyTitle")} />}
          rowClassName={(u) => `user-row-${u.id}`}
        />
      )}
      <InviteModal
        open={inviting}
        onClose={() => setInviting(false)}
        onCreated={(id) => { setInviting(false); toast.success(t("invite.sent")); if (id) navigate(`/users/${id}`); else load(); }}
      />
    </div>
  );
}
