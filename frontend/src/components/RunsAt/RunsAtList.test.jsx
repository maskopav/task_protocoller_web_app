// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, click, act } from "../ui/renderUtil.jsx";
import { ToastProvider } from "../ui";
import { RunsAtList } from "./RunsAtList.jsx";

afterEach(() => { document.body.innerHTML = ""; });

const rows = [
  { key: 1, title: "Clinic A", subtitle: "Brno", on: true, href: "/clinics/1" },
  { key: 2, title: "Clinic B", on: false, disabled: true, disabledReason: "You are not assigned" },
];

describe("RunsAtList", () => {
  it("renders rows, links, subtitle and the disabled reason", () => {
    const { container } = render(<ToastProvider><RunsAtList rows={rows} onToggle={vi.fn()} testId="t" /></ToastProvider>);
    expect(container.querySelector("a[href='/clinics/1']").textContent).toBe("Clinic A");
    expect(container.textContent).toContain("Brno");
    expect(container.textContent).toContain("You are not assigned");
    const sw = container.querySelectorAll('input[role="switch"]');
    expect(sw[0].checked).toBe(true);
    expect(sw[1].disabled).toBe(true);
  });

  it("shows empty text", () => {
    const { container } = render(<RunsAtList rows={[]} emptyText="Nothing" testId="t" />);
    expect(container.querySelector('[data-testid="t-empty"]').textContent).toBe("Nothing");
  });

  it("is busy while the promise runs, then enabled again", async () => {
    let resolve;
    const onToggle = vi.fn(() => new Promise((r) => { resolve = r; }));
    const { container } = render(<ToastProvider><RunsAtList rows={rows} onToggle={onToggle} testId="t" /></ToastProvider>);
    const input = container.querySelector('input[role="switch"]');
    click(input);
    expect(onToggle).toHaveBeenCalledWith(rows[0], false);
    expect(container.querySelector('[data-testid="t-row-1"]').getAttribute("aria-busy")).toBe("true");
    expect(container.querySelector('input[role="switch"]').disabled).toBe(true);
    await act(async () => { resolve(); });
    expect(container.querySelector('[data-testid="t-row-1"]').getAttribute("aria-busy")).toBeNull();
  });

  it("toasts an error when the toggle fails", async () => {
    const onToggle = vi.fn(() => Promise.reject(Object.assign(new Error("runs_at_failed"), { code: "runs_at_failed" })));
    const { container } = render(<ToastProvider><RunsAtList rows={rows} onToggle={onToggle} testId="t" /></ToastProvider>);
    await act(async () => { click(container.querySelector('input[role="switch"]')); });
    expect(document.querySelector('[role="alert"]')).not.toBeNull();
  });
});
