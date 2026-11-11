// src/pages/account/McpTokenTable.jsx — a user's MCP tokens with a revoke
// action. Shared by the Account page (own tokens) and the user page (master).
import React from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button, DataTable, EmptyState } from "../../components/ui";
import { formatDateTime, formatShortDate } from "../../utils/formatDate";
import { tokenStatus } from "./mcpSetup";
import "./account.css";

const TONE = { active: "ok", expired: "neutral", revoked: "neutral" };

export default function McpTokenTable({ tokens, onRevoke, busy = false, testId = "mcp-tokens" }) {
  const { t } = useTranslation("account");
  const columns = [
    { key: "name", header: t("tokens.name"), primary: true, sortable: true },
    { key: "prefix", header: t("tokens.prefix"), render: (r) => <code className="account-mono">{r.prefix}…</code> },
    { key: "createdAt", header: t("tokens.created"), sortable: true, render: (r) => formatShortDate(r.createdAt) },
    { key: "lastUsedAt", header: t("tokens.lastUsed"), sortable: true, render: (r) => (r.lastUsedAt ? formatDateTime(r.lastUsedAt) : t("tokens.never")) },
    { key: "expiresAt", header: t("tokens.expires"), sortable: true, render: (r) => formatShortDate(r.expiresAt) },
    {
      key: "status", header: t("tokens.status"),
      sortValue: (r) => tokenStatus(r),
      render: (r) => { const s = tokenStatus(r); return <Badge tone={TONE[s]}>{t(`tokens.state.${s}`)}</Badge>; },
    },
    {
      key: "actions", header: <span className="account-sr">{t("tokens.actions")}</span>, align: "end",
      render: (r) => (tokenStatus(r) === "active" ? (
        <Button size="sm" variant="danger" disabled={busy} onClick={() => onRevoke(r)} data-testid={`mcp-revoke-${r.id}`}>
          {t("tokens.revoke")}
        </Button>
      ) : null),
    },
  ];
  return (
    <DataTable
      columns={columns}
      rows={tokens}
      defaultSort={{ key: "createdAt", dir: "desc" }}
      empty={<EmptyState icon="link" title={t("tokens.empty")} />}
      data-testid={testId}
    />
  );
}
