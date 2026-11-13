// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { Routes, Route } from "react-router-dom";
import { render, click, act } from "./renderUtil.jsx";

const MASTER = { id: 1, role_id: 1, full_name: "Master User" };
let currentUser = MASTER;
vi.mock("../../context/UserContext", () => ({
  useUser: () => ({ user: currentUser, logout: vi.fn() }),
}));
vi.mock("../../api/uploads", () => ({ fetchUploadSummary: () => Promise.resolve({ unreviewed: 0 }) }));
vi.mock("../../api/sites", () => ({ fetchSites: () => Promise.resolve([]) }));
vi.mock("../../api/projects", () => ({ fetchProjectsList: () => Promise.resolve([]) }));

import AppShell from "./AppShell.jsx";

const tree = (
  <Routes>
    <Route element={<AppShell />}>
      <Route path="/" element={<p data-testid="front">front</p>} />
      <Route path="/clinics/:id" element={<p data-testid="clinic">clinic</p>} />
    </Route>
  </Routes>
);

describe("AppShell brand", () => {
  it("is a link to the front page", async () => {
    const { container, unmount } = render(tree, { route: "/clinics/4" });
    await act(async () => {});
    const home = container.querySelector('[data-testid="shell-home"]');
    expect(home.tagName).toBe("A");
    expect(home.getAttribute("href")).toBe("/");
    expect(container.querySelector('[data-testid="clinic"]')).not.toBeNull();
    click(home);
    expect(container.querySelector('[data-testid="front"]')).not.toBeNull();
    unmount();
  });
});

describe("AppShell Admin section", () => {
  afterEach(() => { currentUser = MASTER; });
  const navOf = async (user) => {
    currentUser = user;
    const r = render(tree, { route: "/" });
    await act(async () => {});
    const has = (id) => r.container.querySelector(`[data-testid="${id}"]`) !== null;
    const heading = r.container.querySelector(".shell-nav-heading") !== null;
    const appRelease = r.container.querySelector('[data-testid="nav-app-release"]');
    const out = { users: has("nav-users"), appRelease: !!appRelease, heading, href: appRelease?.getAttribute("href") };
    r.unmount();
    return out;
  };

  it("master sees Users and App release under the heading", async () => {
    expect(await navOf(MASTER)).toEqual({ users: true, appRelease: true, heading: true, href: "/app-release" });
  });

  it("a user with can_see_technical sees App release (and the heading) but not Users", async () => {
    expect(await navOf({ id: 5, role_id: 2, full_name: "Tech User", can_see_technical: true }))
      .toEqual({ users: false, appRelease: true, heading: true, href: "/app-release" });
  });

  it("a user without the flag sees no Admin section", async () => {
    expect(await navOf({ id: 6, role_id: 2, full_name: "Plain User", can_see_technical: false }))
      .toEqual({ users: false, appRelease: false, heading: false, href: undefined });
  });
});
