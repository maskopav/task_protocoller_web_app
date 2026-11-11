// @vitest-environment jsdom
// Account page, MCP section (docs/mcp/01_spec.md 3.3, 10): not allowed -> no
// create button; allowed -> table, create flow shows the token once, revoke.
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import i18n from "../../i18n";
import AccountPage from "./AccountPage";
import { ConfirmDialogProvider, ToastProvider } from "../../components/ui";

vi.mock("../../api/mcpTokens", () => ({ fetchMyTokens: vi.fn(), createMyToken: vi.fn(), revokeMyToken: vi.fn() }));
vi.mock("../../context/UserContext", () => ({ useUser: () => ({ user: { id: 2, full_name: "Ann Admin", email: "ann@x.test", role_id: 2 } }) }));
import { fetchMyTokens, createMyToken, revokeMyToken } from "../../api/mcpTokens";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const TOKEN = "tpm_" + "a".repeat(43);
const row = (over) => ({
  id: 1, name: "laptop", prefix: "tpm_abcdefgh", createdAt: "2026-11-01T10:00:00.000Z", lastUsedAt: null,
  expiresAt: "2099-01-30T10:00:00.000Z", revokedAt: null, active: true, ...over,
});

let host, root;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const $ = (sel) => document.querySelector(sel);
const byText = (text) => [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === text).pop();
const click = (el) => act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
const type = (el, value) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
});

beforeEach(async () => {
  await i18n.changeLanguage("en");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.clearAllMocks(); });

const render = async () => {
  await act(async () => {
    root.render(<MemoryRouter><ToastProvider><ConfirmDialogProvider><AccountPage /></ConfirmDialogProvider></ToastProvider></MemoryRouter>);
  });
  await flush();
};

describe("Account page: MCP tokens", () => {
  it("explains that MCP is not enabled and offers no create button", async () => {
    fetchMyTokens.mockResolvedValue({ allowed: false, tokens: [] });
    await render();
    expect($('[data-testid="mcp-not-allowed"]')).not.toBeNull();
    expect($('[data-testid="mcp-new-token"]')).toBeNull();
    expect($('[data-testid="mcp-connect"]')).toBeNull();
  });

  it("lists tokens and the connection snippets with a placeholder, never a token", async () => {
    fetchMyTokens.mockResolvedValue({ allowed: true, tokens: [row(), row({ id: 2, name: "old", revokedAt: "2026-11-02T00:00:00Z", active: false })] });
    await render();
    const table = $('[data-testid="mcp-tokens"]');
    expect(table.textContent).toContain("laptop");
    expect(table.textContent).toContain("Revoked");
    expect($('[data-testid="mcp-revoke-1"]')).not.toBeNull();
    expect($('[data-testid="mcp-revoke-2"]')).toBeNull();
    expect($('[data-testid="mcp-snippet-claudeCode"]').textContent).toContain("Bearer tpm_…");
    expect($('[data-testid="mcp-snippet-claudeCode"]').textContent).toMatch(/\/mcp /);
  });

  it("creates a token, shows it once with filled-in snippets, then reloads", async () => {
    fetchMyTokens.mockResolvedValue({ allowed: true, tokens: [] });
    createMyToken.mockResolvedValue({ ...row({ id: 9, name: "Claude Code" }), token: TOKEN });
    await render();
    await click($('[data-testid="mcp-new-token"]'));
    await click($('[data-testid="mcp-create-submit"]'));
    expect(document.body.textContent).toContain("Enter a name");
    expect(createMyToken).not.toHaveBeenCalled();

    await type($('[data-testid="mcp-create-name"]'), "Claude Code");
    await click($('[data-testid="mcp-create-submit"]'));
    await flush();
    expect(createMyToken).toHaveBeenCalledWith({ name: "Claude Code", expiresInDays: 90 });
    expect($('[data-testid="mcp-created"]')).not.toBeNull();
    expect(document.body.textContent).toContain(TOKEN);
    expect(fetchMyTokens).toHaveBeenCalledTimes(2);

    await click($('[data-testid="mcp-created-done"]'));
    expect(document.body.textContent).not.toContain(TOKEN);
  });

  it("shows the server's limit error in the dialog", async () => {
    fetchMyTokens.mockResolvedValue({ allowed: true, tokens: [] });
    createMyToken.mockRejectedValue(Object.assign(new Error("token_limit"), { code: "token_limit", status: 409 }));
    await render();
    await click($('[data-testid="mcp-new-token"]'));
    await type($('[data-testid="mcp-create-name"]'), "x");
    await click($('[data-testid="mcp-create-submit"]'));
    await flush();
    expect(document.body.textContent).toContain("You already have 10 active tokens");
  });

  it("revokes after confirmation", async () => {
    fetchMyTokens.mockResolvedValue({ allowed: true, tokens: [row()] });
    revokeMyToken.mockResolvedValue(null);
    await render();
    await click($('[data-testid="mcp-revoke-1"]'));
    await flush();
    await click(byText("Revoke"));
    await flush();
    expect(revokeMyToken).toHaveBeenCalledWith(1);
  });
});
