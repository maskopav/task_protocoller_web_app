// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { Routes, Route } from "react-router-dom";
import { render, click, act } from "./renderUtil.jsx";

vi.mock("../../context/UserContext", () => ({
  useUser: () => ({ user: { id: 1, role_id: 1, full_name: "Master User" }, logout: vi.fn() }),
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
