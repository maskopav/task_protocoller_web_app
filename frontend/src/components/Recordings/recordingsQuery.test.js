import { describe, it, expect } from "vitest";
import {
  datePreset, datePresetPatch, filterKey, hasActiveFilters, kpiCards, listContext, orderRows, pageWindow,
  readFilters, showClinic, toApiParams,
} from "./recordingsQuery";

const sp = (s) => new URLSearchParams(s);
const NOW = new Date(2026, 9, 25);

describe("filters from the URL", () => {
  it("reads the new names ?clinic= and ?study= and the old ?site= and ?project=", () => {
    expect(readFilters(sp("clinic=4&study=3"))).toMatchObject({ site: ["4"], project: "3" });
    expect(readFilters(sp("site=4&project=Voice"))).toMatchObject({ site: ["4"], project: "Voice" });
    expect(readFilters(sp("site=4&clinic=4&clinic=5")).site).toEqual(["4", "5"]);
  });

  it("falls back to defaults for junk paging and sorting", () => {
    expect(readFilters(sp("pageSize=7&page=-2&dir=sideways"))).toMatchObject({ pageSize: 25, page: 1, dir: "desc", sort: "receivedAt" });
  });

  it("a fixed clinic or study wins over the URL", () => {
    const f = readFilters(sp("clinic=9&study=8"), { clinic: 4, study: 3 });
    expect(f.site).toEqual(["4"]);
    expect(f.project).toBe("3");
  });
});

describe("filter -> API query", () => {
  it("sends only non-default values", () => {
    const p = toApiParams(readFilters(sp("")));
    expect(p).toMatchObject({ q: "", site: [], project: "", sort: "", dir: "", page: "", pageSize: "", dateField: "" });
  });

  it("maps every filter to its API name", () => {
    const p = toApiParams(readFilters(sp("q=%20PD-1%20&clinic=4&study=3&protocol=Speech&status=invalid&qc=unreviewed&flag=late&flag=skipped&hasVideo=1&attention=1&from=2026-10-01&page=3&pageSize=50")));
    expect(p).toEqual({
      q: "PD-1", site: ["4"], project: "3", protocol: "Speech", dateField: "received", from: "2026-10-01", to: "",
      status: "invalid", qc: "unreviewed", flag: ["late", "skipped"], hasVideo: "1", attention: "1",
      sort: "", dir: "", page: 3, pageSize: 50,
    });
  });

  it("keeps a non-default sort", () => {
    expect(toApiParams(readFilters(sp("sort=bytes&dir=asc")))).toMatchObject({ sort: "bytes", dir: "asc" });
  });
});

describe("list context for the detail page's previous/next", () => {
  it("uses the API's filter names, includes fixed filters, and leaves paging out", () => {
    const f = readFilters(sp("clinic=4&qc=unreviewed&page=2&pageSize=50"), { study: 3 });
    const ctx = new URLSearchParams(listContext(f));
    expect(ctx.getAll("site")).toEqual(["4"]);
    expect(ctx.get("project")).toBe("3");
    expect(ctx.get("qc")).toBe("unreviewed");
    expect(ctx.has("page")).toBe(false);
    expect(ctx.has("pageSize")).toBe(false);
    expect(ctx.has("clinic")).toBe(false);
  });

  it("is empty without filters", () => {
    expect(listContext(readFilters(sp("")))).toBe("");
  });

  it("filterKey ignores paging so ticks survive a page change but not a filter change", () => {
    expect(filterKey(readFilters(sp("qc=ok&page=2")))).toBe(filterKey(readFilters(sp("qc=ok&page=3&pageSize=50"))));
    expect(filterKey(readFilters(sp("qc=ok")))).not.toBe(filterKey(readFilters(sp("qc=review"))));
  });

  it("hasActiveFilters ignores the pinned ones", () => {
    expect(hasActiveFilters(readFilters(sp(""), { clinic: 4, study: 3 }), { clinic: 4, study: 3 })).toBe(false);
    expect(hasActiveFilters(readFilters(sp("qc=ok")), {})).toBe(true);
    expect(hasActiveFilters(readFilters(sp("clinic=4")), {})).toBe(true);
  });
});

describe("default order: unreviewed first, then newest", () => {
  const rows = [
    { id: "a", qc: "ok" }, { id: "b", qc: "unreviewed" }, { id: "c", qc: "review" }, { id: "d", qc: "unreviewed" },
  ];
  it("floats unreviewed to the top and keeps the newest-first order within each group", () => {
    expect(orderRows(rows, readFilters(sp(""))).map((r) => r.id)).toEqual(["b", "d", "a", "c"]);
  });
  it("leaves an explicit sort alone", () => {
    expect(orderRows(rows, readFilters(sp("sort=bytes&dir=asc"))).map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
  });
  it("keeps the order when all or none are unreviewed", () => {
    const same = [{ id: "x", qc: "ok" }, { id: "y", qc: "ok" }];
    expect(orderRows(same, readFilters(sp("")))).toBe(same);
  });
});

describe("Clinic filter and column", () => {
  it("are hidden for a user with one clinic", () => {
    expect(showClinic({ isMaster: false, clinicCount: 1, fixedClinic: undefined })).toBe(false);
  });
  it("show for several clinics and always for a master (quarantine has no clinic)", () => {
    expect(showClinic({ isMaster: false, clinicCount: 2 })).toBe(true);
    expect(showClinic({ isMaster: true, clinicCount: 1 })).toBe(true);
  });
  it("are hidden when the list is pinned to a clinic", () => {
    expect(showClinic({ isMaster: true, clinicCount: 5, fixedClinic: 4 })).toBe(false);
  });
});

describe("date presets", () => {
  it("round-trips the presets", () => {
    for (const p of ["any", "today", "week", "month"]) {
      const patch = datePresetPatch(p, NOW);
      const f = readFilters(sp(new URLSearchParams(Object.entries(patch).filter(([, v]) => v)).toString()));
      expect(datePreset(f, NOW)).toBe(p);
    }
  });
  it("calls anything else custom", () => {
    expect(datePreset(readFilters(sp("from=2026-01-01&to=2026-01-31")), NOW)).toBe("custom");
  });
});

describe("KPI cards", () => {
  const kpis = { unreviewed: 7, attention: 3, invalid: 1, received7d: 24 };
  it("show the counts in the spec's order", () => {
    const cards = kpiCards(readFilters(sp("")), kpis, NOW);
    expect(cards.map((c) => [c.key, c.value])).toEqual([["unreviewed", 7], ["attention", 3], ["invalid", 1], ["week", 24]]);
  });
  it("apply their filter, and clear it when pressed again", () => {
    const off = kpiCards(readFilters(sp("")), kpis, NOW);
    expect(off.find((c) => c.key === "unreviewed").patch).toEqual({ qc: "unreviewed" });
    expect(off.find((c) => c.key === "invalid").patch).toEqual({ status: "invalid" });
    expect(off.find((c) => c.key === "attention").patch).toEqual({ attention: true });
    expect(off.find((c) => c.key === "week").patch).toMatchObject({ from: "2026-10-18" });

    const on = kpiCards(readFilters(sp("qc=unreviewed&status=invalid&attention=1&from=2026-10-18")), kpis, NOW);
    expect(on.every((c) => c.on)).toBe(true);
    expect(on.find((c) => c.key === "unreviewed").patch).toEqual({ qc: "" });
    expect(on.find((c) => c.key === "attention").patch).toEqual({ attention: false });
    expect(on.find((c) => c.key === "week").patch).toEqual({ from: "", to: "" });
  });
});

describe("pageWindow", () => {
  it("windows around the current page with gaps", () => {
    expect(pageWindow(5, 10)).toEqual([1, "gap4", 4, 5, 6, "gap10", 10]);
    expect(pageWindow(1, 1)).toEqual([1]);
  });
});
