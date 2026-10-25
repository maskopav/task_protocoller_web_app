import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db/queryHelper.js", () => ({
  executeQuery: vi.fn(),
  executeTransaction: vi.fn(),
}));

const { executeQuery } = await import("../db/queryHelper.js");
const { loadSiteContext } = await import("./siteContext.js");
const { deriveConfigVersion } = await import("../utils/extConfig.js");

// Dispatch on SQL substrings so the test does not depend on query order.
const mockDb = ({ site = { updated_at: "2026-09-01 10:00:00" }, spine = [] } = {}) => {
  executeQuery.mockImplementation(async (sql) => {
    if (sql.includes("FROM v_site_protocols")) return spine;
    if (sql.includes("FROM sites")) return site ? [site] : [];
    throw new Error(`unexpected query: ${sql}`);
  });
};

const spine = [
  { project_id: 1, project_name: "Project A", protocol_id: 10, protocol_name: "P10", updated_at: "2026-09-10 09:30:00" },
  { project_id: 1, project_name: "Project A", protocol_id: 11, protocol_name: "P11", updated_at: "2026-09-12 07:05:09" },
  { project_id: 2, project_name: "Project B", protocol_id: 12, protocol_name: "P12", updated_at: "2026-08-01 00:00:00" },
];

describe("loadSiteContext", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns an empty context for a quarantined session without touching the DB", async () => {
    expect(await loadSiteContext(null)).toEqual({ currentConfigVersion: null, projects: [] });
    expect(executeQuery).not.toHaveBeenCalled();
  });

  it("groups protocols under their projects", async () => {
    mockDb({ spine });
    const ctx = await loadSiteContext(5);
    expect(ctx.projects).toEqual([
      { id: 1, name: "Project A", protocols: [{ id: 10, name: "P10" }, { id: 11, name: "P11" }] },
      { id: 2, name: "Project B", protocols: [{ id: 12, name: "P12" }] },
    ]);
  });

  it("keeps same-named protocols of two studies apart (names are unique per study only)", async () => {
    mockDb({
      spine: [
        { project_id: 1, project_name: "Study A", protocol_id: 10, protocol_name: "Speech battery", updated_at: "2026-09-10 09:30:00" },
        { project_id: 2, project_name: "Study B", protocol_id: 20, protocol_name: "Speech battery", updated_at: "2026-09-10 09:30:00" },
      ],
    });
    expect((await loadSiteContext(5)).projects).toEqual([
      { id: 1, name: "Study A", protocols: [{ id: 10, name: "Speech battery" }] },
      { id: 2, name: "Study B", protocols: [{ id: 20, name: "Speech battery" }] },
    ]);
  });

  it("reads the spine view only, which never contains library entries", async () => {
    mockDb({ spine });
    await loadSiteContext(5);
    const sqls = executeQuery.mock.calls.map(([sql]) => sql).join(" ");
    expect(sqls).toContain("v_site_protocols");
    expect(sqls).not.toMatch(/project_protocols|user_projects/);
  });

  it("derives the version from the newest of the site and every protocol row", async () => {
    mockDb({ spine });
    expect((await loadSiteContext(5)).currentConfigVersion).toBe("2026-09-12.070509");
    mockDb({ site: { updated_at: "2026-10-01 12:00:00" }, spine });
    expect((await loadSiteContext(5)).currentConfigVersion).toBe("2026-10-01.120000");
  });

  it("matches the shared derivation that site-config uses", async () => {
    mockDb({ spine });
    const expected = deriveConfigVersion("2026-09-01 10:00:00", spine.map((r) => r.updated_at));
    expect((await loadSiteContext(5)).currentConfigVersion).toBe(expected);
  });

  it("scopes every query to the site id with a bound parameter", async () => {
    mockDb({ spine });
    await loadSiteContext(5);
    for (const [, params] of executeQuery.mock.calls) expect(params).toEqual([5]);
  });

  it("handles a site with no protocols", async () => {
    mockDb({ spine: [] });
    expect(await loadSiteContext(5)).toEqual({ currentConfigVersion: "2026-09-01.100000", projects: [] });
  });

  it("returns an empty context for a site that no longer exists", async () => {
    mockDb({ site: null });
    expect(await loadSiteContext(99)).toEqual({ currentConfigVersion: null, projects: [] });
  });
});
