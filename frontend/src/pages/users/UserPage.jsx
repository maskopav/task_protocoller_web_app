// src/pages/users/UserPage.jsx — one user: profile, clinics, permissions (section 6.8).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Badge, Button, EmptyState, PageHeader, Section, Switch, TextField, useConfirm, useToast } from "../../components/ui";
import { fetchUser, setUserSites, updateUser } from "../../api/users";
import { fetchSites } from "../../api/sites";
import { adminForgotPasswordApi } from "../../api/auth";
import { apiErrorMessage } from "../../utils/apiError";
import NotFoundPage from "../NotFoundPage";
import { clinicIds, filterClinics, isMasterUser, profileChanged, profileError, toggleClinic } from "./userLogic";
import "./users.css";

export default function UserPage() {
  const { id } = useParams();
  const { t } = useTranslation("users");
  const { t: tc } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();

  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ready | missing
  const [clinics, setClinics] = useState([]);
  const [form, setForm] = useState({ name: "", email: "" });
  const [formError, setFormError] = useState({});
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const u = await fetchUser(id);
      setUser(u);
      setForm({ name: u.name || "", email: u.email || "" });
      setStatus("ready");
    } catch (err) {
      if (err?.status === 404 || err?.code === "not_found") setStatus("missing");
      else { setStatus((s) => (s === "loading" ? "missing" : s)); toast.error(apiErrorMessage(err, tc)); }
    }
  }, [id, toast, tc]);

  useEffect(() => { setStatus("loading"); setUser(null); load(); }, [load]);
  useEffect(() => {
    fetchSites().then((l) => setClinics(Array.isArray(l) ? l : [])).catch((err) => toast.error(apiErrorMessage(err, tc)));
  }, [toast, tc]);

  const assigned = useMemo(() => clinicIds(user), [user]);
  const visibleClinics = useMemo(() => filterClinics(clinics, query), [clinics, query]);

  // Runs one change against the server, then reloads; failures become toasts.
  const run = async (action, successMessage) => {
    setBusy(true);
    try {
      await action();
      if (successMessage) toast.success(successMessage);
      await load();
    } catch (err) {
      toast.error(err?.code === "email_taken" ? t("errors.emailTaken") : apiErrorMessage(err, tc));
    } finally {
      setBusy(false);
    }
  };

  if (status === "missing") return <NotFoundPage />;
  if (status === "loading" || !user) return <div className="users-page"><EmptyState title={t("loading")} /></div>;

  const master = isMasterUser(user);
  const label = user.name || user.email;

  const saveProfile = (e) => {
    e.preventDefault();
    const key = profileError(form);
    if (key) { setFormError(key === "nameRequired" ? { name: t(`errors.${key}`) } : { email: t(`errors.${key}`) }); return; }
    setFormError({});
    run(() => updateUser(user.id, { name: form.name.trim(), email: form.email.trim() }), t("saved"));
  };

  const toggleActive = async (next) => {
    if (!next) {
      const ok = await confirm({
        title: t("deactivate.title", { name: label }), message: t("deactivate.message"),
        confirmText: t("deactivate.confirm"), cancelText: t("cancel"), danger: true,
      });
      if (!ok) return;
    }
    run(() => updateUser(user.id, { is_active: next }), next ? t("activated") : t("deactivated"));
  };

  const resend = () => run(() => adminForgotPasswordApi(user.email), t("resendSent", { email: user.email }));

  return (
    <div className="users-page" data-testid="user-page">
      <PageHeader
        breadcrumbs={[{ label: t("list.title"), to: "/users" }, { label }]}
        title={label}
        badges={(
          <>
            <Badge tone={user.is_active ? "ok" : "neutral"}>{user.is_active ? t("active") : t("disabled")}</Badge>
            {master && <Badge tone="accent">{t("master")}</Badge>}
          </>
        )}
        sub={user.email}
      />

      <Section title={t("profile.title")}>
        <form className="users-card" onSubmit={saveProfile} noValidate>
          <div className="users-grid">
            <TextField label={t("fields.name")} value={form.name} error={formError.name} data-testid="user-field-name"
              onChange={(e) => { setForm({ ...form, name: e.target.value }); setFormError({}); }} />
            <TextField label={t("fields.email")} type="email" value={form.email} error={formError.email} data-testid="user-field-email"
              onChange={(e) => { setForm({ ...form, email: e.target.value }); setFormError({}); }} />
          </div>
          <div className="users-row">
            <Button variant="primary" type="submit" disabled={busy || !profileChanged(user, form)} data-testid="user-save">{t("profile.save")}</Button>
            <Button onClick={resend} disabled={busy} data-testid="user-resend">{t("profile.resend")}</Button>
          </div>
          <Switch
            label={t("profile.activeLabel")} checked={user.is_active} disabled={busy}
            onChange={toggleActive} data-testid="user-active"
          />
        </form>
      </Section>

      <Section title={t("clinics.title")} hint={master ? undefined : t("clinics.count", { count: assigned.length })}>
        {master ? (
          <div className="users-card"><p>{t("clinics.masterAll")}</p></div>
        ) : (
          <div className="users-card" data-testid="user-clinics">
            <TextField label={t("clinics.search")} type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
            {visibleClinics.length === 0 ? (
              <p>{t("clinics.none")}</p>
            ) : (
              <ul className="users-checklist">
                {visibleClinics.map((c) => (
                  <li key={c.id}>
                    <label className="users-check">
                      <input
                        type="checkbox" checked={assigned.includes(c.id)} disabled={busy}
                        data-testid={`user-clinic-${c.id}`}
                        onChange={() => run(() => setUserSites(user.id, toggleClinic(assigned, c.id)))}
                      />
                      <span>{c.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Section>

      {!master && (
        <Section title={t("permissions.title")} hint={t("permissions.hint")}>
          <div className="users-card">
            <Switch
              label={t("permissions.studies")} checked={user.can_create_projects} disabled={busy}
              onChange={(v) => run(() => updateUser(user.id, { can_create_projects: v }))} data-testid="user-flag-studies"
            />
            <Switch
              label={t("permissions.clinics")} checked={user.can_create_sites} disabled={busy}
              onChange={(v) => run(() => updateUser(user.id, { can_create_sites: v }))} data-testid="user-flag-clinics"
            />
          </div>
        </Section>
      )}
    </div>
  );
}
