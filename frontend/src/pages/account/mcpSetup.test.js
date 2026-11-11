import { describe, it, expect } from "vitest";
import { activeCount, clientSnippets, mcpEndpoint, tokenStatus } from "./mcpSetup";

describe("mcpEndpoint", () => {
  it("resolves a relative API base against the page, without the #/route", () => {
    expect(mcpEndpoint("./api", "https://malenia.example.org/koubic/#/account")).toBe("https://malenia.example.org/koubic/api/mcp");
    expect(mcpEndpoint("./api/", "https://h.example/app/index.html#/x")).toBe("https://h.example/app/api/mcp");
  });
  it("keeps an absolute API base", () => {
    expect(mcpEndpoint("http://localhost:3000", "https://localhost:5173/#/account")).toBe("http://localhost:3000/mcp");
  });
});

describe("clientSnippets", () => {
  const url = "https://h.example/koubic/api/mcp";
  it("uses a placeholder unless a token is given", () => {
    const s = clientSnippets(url);
    expect(s.map((x) => x.key)).toEqual(["claudeCode", "vscode", "bridge"]);
    expect(s[0].code).toBe(`claude mcp add --transport http task-protocoller ${url} --header "Authorization: Bearer tpm_…"`);
    expect(s.every((x) => !/tpm_[A-Za-z0-9_-]{10}/.test(x.code))).toBe(true);
  });
  it("produces valid JSON configs; VS Code always prompts for the token", () => {
    const [, vscode, bridge] = clientSnippets(url, "tpm_SECRET");
    const v = JSON.parse(vscode.code);
    expect(v.servers["task-protocoller"]).toEqual({ type: "http", url, headers: { Authorization: "Bearer ${input:tp-token}" } });
    expect(vscode.code).not.toContain("tpm_SECRET");
    const b = JSON.parse(bridge.code).mcpServers["task-protocoller"];
    expect(b.args).toEqual(["-y", "mcp-remote", url, "--header", "Authorization:${TP_AUTH}"]);
    expect(b.env.TP_AUTH).toBe("Bearer tpm_SECRET");
  });
});

describe("tokenStatus", () => {
  const now = Date.parse("2026-11-11T12:00:00Z");
  it("revoked wins, then expired, else active", () => {
    expect(tokenStatus({ revokedAt: "2026-11-01T00:00:00Z", active: false }, now)).toBe("revoked");
    expect(tokenStatus({ active: false, expiresAt: "2026-12-01T00:00:00Z" }, now)).toBe("expired");
    expect(tokenStatus({ active: true, expiresAt: "2026-11-11T11:59:59Z" }, now)).toBe("expired");
    expect(tokenStatus({ active: true, expiresAt: "2026-12-01T00:00:00Z" }, now)).toBe("active");
    expect(activeCount([{ active: true }, { revokedAt: "x" }, { active: true, expiresAt: "2026-12-01T00:00:00Z" }], now)).toBe(2);
  });
});
