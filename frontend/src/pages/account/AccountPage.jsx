// src/pages/account/AccountPage.jsx — the signed-in user's account: who you
// are, and connecting AI assistants over MCP (docs/mcp/01_spec.md 3.3, 10).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Badge, Button, CopyField, EmptyState, IconButton, KeyValue, Modal, PageHeader, Section, Select, TextField,
  useConfirm, useToast,
} from "../../components/ui";
import { useUser } from "../../context/UserContext";
import { createMyToken, fetchMyTokens, revokeMyToken } from "../../api/mcpTokens";
import { apiErrorMessage } from "../../utils/apiError";
import McpTokenTable from "./McpTokenTable";
import { DEFAULT_EXPIRY, EXPIRY_OPTIONS, activeCount, clientSnippets, mcpEndpoint } from "./mcpSetup";
import "./account.css";

const MAX_ACTIVE = 10;

function CodeBlock({ code, label, testId }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* no clipboard */ }
  };
  return (
    <div className="account-code">
      <pre aria-label={label} data-testid={testId}><code>{code}</code></pre>
      <IconButton icon={copied ? "check" : "copy"} label={copied ? t("ui.copied", "Copied") : t("ui.copy", "Copy")} onClick={copy} />
    </div>
  );
}

function Snippets({ endpoint, token }) {
  const { t } = useTranslation("account");
  const snippets = useMemo(() => clientSnippets(endpoint, token), [endpoint, token]);
  return (
    <div className="account-snippets">
      {snippets.map((s) => (
        <div key={s.key} className="account-snippet">
          <h4>{t(`connect.${s.key}.title`)}</h4>
          <p>{t(`connect.${s.key}.hint`)}</p>
          <CodeBlock code={s.code} label={t(`connect.${s.key}.title`)} testId={`mcp-snippet-${s.key}`} />
        </div>
      ))}
    </div>
  );
}

function CreateTokenModal({ open, onClose, onCreated }) {
  const { t } = useTranslation("account");
  const { t: tc } = useTranslation();
  const [name, setName] = useState("");
  const [days, setDays] = useState(DEFAULT_EXPIRY);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);
  const endpoint = mcpEndpoint();

  useEffect(() => { if (open) { setName(""); setDays(DEFAULT_EXPIRY); setError(null); setCreated(null); } }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError(t("create.nameRequired")); return; }
    setBusy(true);
    try {
      const row = await createMyToken({ name: name.trim(), expiresInDays: days });
      setCreated(row);
      onCreated?.();
    } catch (err) {
      setError(t(`errors.${err?.code}`, { defaultValue: apiErrorMessage(err, tc), max: MAX_ACTIVE }));
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <Modal
        open={open} onClose={onClose} size="wide" title={t("created.title")} description={t("created.once")}
        footer={<Button variant="primary" onClick={onClose} data-testid="mcp-created-done">{t("created.done")}</Button>}
        data-testid="mcp-created"
      >
        <div className="account-stack">
          <CopyField value={created.token} label={t("created.token")} />
          <Snippets endpoint={endpoint} token={created.token} />
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open} onClose={onClose} dismissible={!busy} title={t("create.title")} description={t("create.description")}
      footer={(
        <>
          <Button onClick={onClose} disabled={busy}>{tc("cancel", "Cancel")}</Button>
          <Button variant="primary" type="submit" form="mcp-create-form" disabled={busy} data-testid="mcp-create-submit">{t("create.submit")}</Button>
        </>
      )}
    >
      <form id="mcp-create-form" className="account-stack" onSubmit={submit} noValidate>
        <TextField
          label={t("create.name")} help={t("create.nameHelp")} value={name} maxLength={64} error={error} data-autofocus
          onChange={(e) => { setName(e.target.value); setError(null); }} data-testid="mcp-create-name"
        />
        <Select
          label={t("create.expiry")} value={days} onChange={(e) => setDays(Number(e.target.value))}
          options={EXPIRY_OPTIONS.map((d) => ({ value: d, label: t("create.days", { count: d }) }))}
          data-testid="mcp-create-expiry"
        />
      </form>
    </Modal>
  );
}

export default function AccountPage() {
  const { t } = useTranslation("account");
  const { t: tc } = useTranslation();
  const { user } = useUser();
  const toast = useToast();
  const confirm = useConfirm();
  const [state, setState] = useState({ status: "loading", allowed: false, tokens: [] });
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const endpoint = mcpEndpoint();

  const load = useCallback(async () => {
    try {
      const r = await fetchMyTokens();
      setState({ status: "ready", allowed: !!r.allowed, tokens: r.tokens ?? [] });
    } catch (err) {
      setState((s) => ({ ...s, status: "error" }));
      toast.error(apiErrorMessage(err, tc));
    }
  }, [toast, tc]);
  useEffect(() => { load(); }, [load]);

  const revoke = async (row) => {
    const ok = await confirm({
      title: t("revoke.title", { name: row.name }), message: t("revoke.message"),
      confirmText: t("revoke.confirm"), cancelText: tc("cancel", "Cancel"), danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await revokeMyToken(row.id);
      toast.success(t("revoke.done"));
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err, tc));
    } finally {
      setBusy(false);
    }
  };

  const atLimit = activeCount(state.tokens) >= MAX_ACTIVE;

  return (
    <div className="account-page" data-testid="account-page">
      <PageHeader title={t("title")} sub={user?.email} />

      <Section title={t("profile.title")}>
        <div className="account-card">
          <KeyValue cols={2} items={[
            { label: t("profile.name"), value: user?.full_name || "—" },
            { label: t("profile.email"), value: user?.email || "—" },
          ]} />
        </div>
      </Section>

      <Section
        title={t("mcp.title")}
        hint={state.allowed ? t("mcp.activeCount", { count: activeCount(state.tokens), max: MAX_ACTIVE }) : undefined}
        actions={state.allowed ? (
          <Button variant="primary" icon="plus" onClick={() => setCreating(true)} disabled={atLimit} data-testid="mcp-new-token"
            title={atLimit ? t("errors.token_limit", { max: MAX_ACTIVE }) : undefined}>
            {t("mcp.newToken")}
          </Button>
        ) : null}
      >
        <div className="account-stack">
        <div className="account-card">
          <p>{t("mcp.intro")}</p>
          <p className="account-privacy"><Badge tone="accent">{t("mcp.privacyBadge")}</Badge> {t("mcp.privacy")}</p>
        </div>

        {state.status === "loading" ? (
          <EmptyState title={t("loading")} />
        ) : !state.allowed ? (
          <EmptyState icon="lock" title={t("mcp.notAllowed.title")} description={t("mcp.notAllowed.description")} data-testid="mcp-not-allowed" />
        ) : (
          <>
            <McpTokenTable tokens={state.tokens} onRevoke={revoke} busy={busy} />
            <div className="account-card" data-testid="mcp-connect">
              <h3 className="account-h3">{t("connect.title")}</h3>
              <p>{t("connect.intro")}</p>
              <CopyField value={endpoint} label={t("connect.endpoint")} />
              <Snippets endpoint={endpoint} />
            </div>
          </>
        )}
        </div>
      </Section>

      <CreateTokenModal open={creating} onClose={() => setCreating(false)} onCreated={load} />
    </div>
  );
}
