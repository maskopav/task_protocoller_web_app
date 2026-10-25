// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, click, key } from "./renderUtil.jsx";
import {
  Icon, ICON_NAMES, Button, IconButton, PageHeader, Breadcrumbs, Tabs, Section, DataTable,
  Badge, StatusDot, EmptyState, KeyValue,
} from "./index.js";

afterEach(() => { document.body.innerHTML = ""; });

describe("Icon", () => {
  it("covers every mockup icon", () => {
    for (const n of ["inbox", "study", "clinic", "library", "users", "search", "download", "more", "lock", "plus", "check", "alert", "copy", "eye", "computer", "play", "globe", "logout", "grip", "x", "chevron", "left", "video", "mic", "file", "settings", "link", "wave", "refresh"]) {
      expect(ICON_NAMES).toContain(n);
    }
  });
  it("is aria-hidden without title and labelled with one", () => {
    const { container } = render(<><Icon name="lock" /><Icon name="lock" title="Locked" size={20} /></>);
    const [a, b] = container.querySelectorAll("svg");
    expect(a.getAttribute("aria-hidden")).toBe("true");
    expect(b.getAttribute("aria-label")).toBe("Locked");
    expect(b.getAttribute("width")).toBe("20");
  });
  it("renders nothing for an unknown name", () => {
    expect(render(<Icon name="nope" />).container.querySelector("svg")).toBeNull();
  });
});

describe("Button / IconButton", () => {
  it("defaults to secondary, type=button", () => {
    const { container } = render(<Button>Go</Button>);
    const b = container.querySelector("button");
    expect(b.className).toBe("ui-btn");
    expect(b.type).toBe("button");
  });
  it("applies variant, size and icon", () => {
    const { container } = render(<Button variant="primary" size="sm" icon="plus">New</Button>);
    const b = container.querySelector("button");
    expect(b.className).toContain("ui-btn-primary");
    expect(b.className).toContain("ui-btn-sm");
    expect(b.querySelector("svg")).not.toBeNull();
  });
  it("renders as another element", () => {
    const { container } = render(<Button as="a" href="#/x">Link</Button>);
    expect(container.querySelector("a.ui-btn").getAttribute("href")).toBe("#/x");
    expect(container.querySelector("a").hasAttribute("type")).toBe(false);
  });
  it("IconButton carries aria-label and title", () => {
    const fn = vi.fn();
    const { container } = render(<IconButton icon="x" label="Close" onClick={fn} />);
    const b = container.querySelector("button");
    expect(b.getAttribute("aria-label")).toBe("Close");
    expect(b.title).toBe("Close");
    click(b);
    expect(fn).toHaveBeenCalled();
  });
});

describe("PageHeader / Breadcrumbs", () => {
  it("renders title, badges, sub, actions and linked crumbs", () => {
    const { container } = render(
      <PageHeader
        breadcrumbs={[{ label: "Studies", to: "/studies" }, { label: "Stroke" }]}
        title="Stroke"
        badges={<Badge lock>Received</Badge>}
        sub="Sub line"
        actions={<Button variant="primary">New</Button>}
      />,
    );
    expect(container.querySelector("h1").textContent).toBe("Stroke");
    expect(container.querySelector(".ui-crumbs a").getAttribute("href")).toBe("/studies");
    expect(container.querySelector('[aria-current="page"]').textContent).toBe("Stroke");
    expect(container.querySelector(".ui-page-head-sub").textContent).toBe("Sub line");
    expect(container.querySelectorAll(".ui-btn-primary")).toHaveLength(1);
  });
  it("omits crumbs when none", () => {
    expect(render(<PageHeader title="X" />).container.querySelector(".ui-crumbs")).toBeNull();
  });
  it("Breadcrumbs renders the separator between items only", () => {
    const { container } = render(<Breadcrumbs items={[{ label: "A", to: "/a" }, { label: "B", to: "/b" }, { label: "C" }]} />);
    expect(container.querySelectorAll(".ui-crumbs-sep")).toHaveLength(2);
  });
});

describe("Tabs", () => {
  it("marks the tab matching the route active and shows counts", () => {
    const { container } = render(
      <Tabs items={[{ to: "/a", label: "A", count: 3, testId: "tab-a" }, { to: "/b", label: "B" }]} />,
      { route: "/b" },
    );
    const [a, b] = container.querySelectorAll("a");
    expect(a.className).not.toContain("ui-tab-active");
    expect(b.className).toContain("ui-tab-active");
    expect(a.querySelector(".ui-tab-count").textContent).toBe("3");
    expect(a.getAttribute("data-testid")).toBe("tab-a");
  });
});

describe("Section", () => {
  it("renders heading, hint, actions and children", () => {
    const { container } = render(<Section title="Editors" hint="who" actions={<span id="act" />}><p>body</p></Section>);
    expect(container.querySelector("h2").textContent).toBe("Editors");
    expect(container.querySelector(".ui-section-hint").textContent).toBe("who");
    expect(container.querySelector("#act")).not.toBeNull();
    expect(container.querySelector("p").textContent).toBe("body");
  });
});

describe("Badge / StatusDot / EmptyState / KeyValue", () => {
  it("Badge tone and lock icon", () => {
    const { container } = render(<><Badge tone="ok">Fine</Badge><Badge lock>Received</Badge></>);
    const [a, b] = container.querySelectorAll(".ui-badge");
    expect(a.className).toContain("ui-badge-ok");
    expect(a.querySelector("svg")).toBeNull();
    expect(b.querySelector("svg")).not.toBeNull();
  });
  it("StatusDot tone", () => {
    const { container } = render(<StatusDot tone="bad">Offline</StatusDot>);
    expect(container.querySelector(".ui-dot").className).toContain("ui-dot-bad");
    expect(container.textContent).toBe("Offline");
  });
  it("EmptyState shows title, description and action", () => {
    const { container } = render(<EmptyState title="Nothing" description="Add one" action={<Button>Add</Button>} />);
    expect(container.querySelector("h3").textContent).toBe("Nothing");
    expect(container.querySelector(".ui-empty-action button")).not.toBeNull();
  });
  it("KeyValue skips empty values unless keepEmpty", () => {
    const items = [{ label: "A", value: "1" }, { label: "B", value: null }, { label: "C", value: "" }];
    expect(render(<KeyValue items={items} />).container.querySelectorAll("dt")).toHaveLength(1);
    expect(render(<KeyValue items={items} keepEmpty cols={2} />).container.querySelectorAll("dt")).toHaveLength(3);
  });
});

describe("DataTable", () => {
  const columns = [
    { key: "name", header: "Name", sortable: true, primary: true },
    { key: "n", header: "Count", align: "num", sortable: true, render: (r) => `#${r.n}` },
    { key: "act", header: "", align: "end", render: () => <button type="button" id="inner">x</button> },
  ];
  const rows = [{ id: 1, name: "Beta", n: 2 }, { id: 2, name: "Alpha", n: 10 }];
  const names = (c) => [...c.querySelectorAll("tbody tr")].map((tr) => tr.children[0].textContent);

  it("renders rows and the empty state", () => {
    const { container } = render(<DataTable columns={columns} rows={rows} />);
    expect(names(container)).toEqual(["Beta", "Alpha"]);
    expect(render(<DataTable columns={columns} rows={[]} empty={<EmptyState title="None" />} />).container.textContent).toContain("None");
  });
  it("sorts by clicking a sortable header (toggles direction, numeric aware)", () => {
    const { container } = render(<DataTable columns={columns} rows={rows} />);
    const [nameBtn, countBtn] = container.querySelectorAll("th button");
    click(nameBtn);
    expect(names(container)).toEqual(["Alpha", "Beta"]);
    click(nameBtn);
    expect(names(container)).toEqual(["Beta", "Alpha"]);
    click(countBtn);
    expect(names(container)).toEqual(["Beta", "Alpha"]);
    expect(container.querySelectorAll("th")[1].getAttribute("aria-sort")).toBe("ascending");
  });
  it("row click and keyboard activate, inner controls do not", () => {
    const fn = vi.fn();
    const { container } = render(<DataTable columns={columns} rows={rows} onRowClick={fn} />);
    const tr = container.querySelector("tbody tr");
    expect(tr.tabIndex).toBe(0);
    click(tr.children[0]);
    expect(fn).toHaveBeenCalledWith(rows[0]);
    fn.mockClear();
    click(tr.querySelector("#inner"));
    expect(fn).not.toHaveBeenCalled();
    key(tr, "Enter");
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("non-clickable rows are not focusable", () => {
    const { container } = render(<DataTable columns={columns} rows={rows} />);
    expect(container.querySelector("tbody tr").hasAttribute("tabindex")).toBe(false);
  });
});
