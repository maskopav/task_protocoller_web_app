// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, click, key, mousedown, act } from "./renderUtil.jsx";
import {
  Menu, Switch, TextField, Select, CopyField, Modal, Button, ToastProvider, useToast,
  ConfirmDialogProvider, useConfirm,
} from "./index.js";

afterEach(() => { document.body.innerHTML = ""; vi.useRealTimers(); });

describe("Menu", () => {
  const items = [{ label: "Edit", onSelect: vi.fn() }, { separator: true }, { label: "Delete", danger: true, onSelect: vi.fn() }];
  it("opens, selects and closes", () => {
    items[0].onSelect.mockClear();
    const { container } = render(<Menu label="Row actions" items={items} />);
    expect(container.querySelector('[role="menu"]')).toBeNull();
    click(container.querySelector('button[aria-label="Row actions"]'));
    expect(container.querySelector('[role="menu"]')).not.toBeNull();
    expect(container.querySelector(".ui-menu-danger").textContent).toBe("Delete");
    click(container.querySelector('[role="menuitem"]'));
    expect(items[0].onSelect).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });
  it("closes on Escape and returns focus to the trigger", () => {
    const { container } = render(<Menu label="m" items={items} />);
    const trigger = container.querySelector("button");
    click(trigger);
    key(container.querySelector('[role="menuitem"]'), "Escape");
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
  it("closes on outside mousedown; arrows move focus", () => {
    const { container } = render(<Menu label="m" items={items} />);
    click(container.querySelector("button"));
    const [first, second] = container.querySelectorAll('[role="menuitem"]');
    expect(document.activeElement).toBe(first);
    key(first, "ArrowDown");
    expect(document.activeElement).toBe(second);
    mousedown(document.body);
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });
});

describe("Switch", () => {
  it("is a labelled checkbox switch and reports the new value", () => {
    const fn = vi.fn();
    const { container } = render(<Switch checked={false} label="Runs at" onChange={fn} />);
    const input = container.querySelector('input[role="switch"]');
    expect(container.textContent).toBe("Runs at");
    click(input);
    expect(fn.mock.calls[0][0]).toBe(true);
  });
  it("hideLabel keeps an aria-label", () => {
    const { container } = render(<Switch checked label="Active" hideLabel onChange={() => {}} />);
    expect(container.querySelector("input").getAttribute("aria-label")).toBe("Active");
    expect(container.textContent).toBe("");
  });
});

describe("TextField / Select", () => {
  it("links label, help and error", () => {
    const { container } = render(<><TextField label="Name" help="Shown to users" /><TextField label="Mail" error="Bad" /></>);
    const [a, b] = container.querySelectorAll("input");
    expect(container.querySelector(`label[for="${a.id}"]`).textContent).toBe("Name");
    expect(container.querySelector(`#${CSS.escape(a.id)}-help`).textContent).toBe("Shown to users");
    expect(b.getAttribute("aria-invalid")).toBe("true");
    expect(container.querySelector(".ui-field-error").textContent).toBe("Bad");
  });
  it("TextField multiline renders a textarea", () => {
    expect(render(<TextField label="Notes" multiline />).container.querySelector("textarea")).not.toBeNull();
  });
  it("Select renders options", () => {
    const { container } = render(<Select label="Clinic" options={[{ value: "a", label: "A" }, { value: "b", label: "B" }]} defaultValue="b" />);
    expect(container.querySelectorAll("option")).toHaveLength(2);
    expect(container.querySelector("select").value).toBe("b");
    expect(container.querySelector("label").textContent).toBe("Clinic");
  });
});

describe("CopyField", () => {
  it("copies the value and flips the icon label", async () => {
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const { container } = render(<CopyField value="abc-123" />);
    expect(container.querySelector(".ui-copyfield-val").textContent).toBe("abc-123");
    await act(async () => { container.querySelector("button").click(); });
    expect(writeText).toHaveBeenCalledWith("abc-123");
    expect(container.querySelector("button").getAttribute("aria-label")).toBe("Copied");
  });
  it("masks the value but still copies it", async () => {
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const { container } = render(<CopyField value="secret" masked />);
    expect(container.textContent).not.toContain("secret");
    await act(async () => { container.querySelector("button").click(); });
    expect(writeText).toHaveBeenCalledWith("secret");
  });
});

describe("Modal", () => {
  it("renders nothing when closed", () => {
    render(<Modal open={false} onClose={() => {}} title="T" />);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it("renders header, body, footer into the body with dialog semantics", () => {
    render(<Modal open onClose={() => {}} title="Title" description="Desc" footer={<Button>OK</Button>}><input aria-label="f" /></Modal>);
    const d = document.querySelector('[role="dialog"]');
    expect(d.getAttribute("aria-modal")).toBe("true");
    expect(document.getElementById(d.getAttribute("aria-labelledby")).textContent).toBe("Title");
    expect(d.querySelector(".ui-modal-foot button").textContent).toBe("OK");
    expect(document.activeElement).toBe(d.querySelector("input"));
  });
  it("closes on Escape and backdrop, not on clicks inside", () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="T"><p>x</p></Modal>);
    mousedown(document.querySelector(".ui-modal p"));
    expect(onClose).not.toHaveBeenCalled();
    mousedown(document.querySelector(".ui-modal-back"));
    expect(onClose).toHaveBeenCalledTimes(1);
    key(document, "Escape");
    expect(onClose).toHaveBeenCalledTimes(2);
  });
  it("is not dismissible when dismissible=false", () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="T" dismissible={false}><p>x</p></Modal>);
    key(document, "Escape");
    mousedown(document.querySelector(".ui-modal-back"));
    expect(onClose).not.toHaveBeenCalled();
  });
  it("traps Tab inside", () => {
    render(<Modal open onClose={() => {}} title="T" footer={<><Button>One</Button><Button>Two</Button></>} />);
    const [one, two] = document.querySelectorAll(".ui-modal-foot button");
    two.focus();
    key(document, "Tab");
    expect(document.activeElement).toBe(one);
    key(document, "Tab", { shiftKey: true });
    expect(document.activeElement).toBe(two);
  });
});

describe("Toast", () => {
  function Probe() {
    const toast = useToast();
    return <button type="button" onClick={() => toast.error("Boom")}>go</button>;
  }
  it("shows an error toast and auto-dismisses", () => {
    vi.useFakeTimers();
    const { container } = render(<ToastProvider duration={1000}><Probe /></ToastProvider>);
    click(container.querySelector("button"));
    const t = document.querySelector(".ui-toast");
    expect(t.textContent).toContain("Boom");
    expect(t.getAttribute("role")).toBe("alert");
    act(() => { vi.advanceTimersByTime(2100); });
    expect(document.querySelector(".ui-toast")).toBeNull();
  });
  it("can be dismissed manually; useToast is a no-op without a provider", () => {
    const { container } = render(<ToastProvider><Probe /></ToastProvider>);
    click(container.querySelector("button"));
    click(document.querySelector(".ui-toast-close"));
    expect(document.querySelector(".ui-toast")).toBeNull();
    const bare = render(<Probe />);
    expect(() => click(bare.container.querySelector("button"))).not.toThrow();
  });
});

describe("ConfirmDialog (restyled provider, same API)", () => {
  function Probe({ onResult, options }) {
    const confirm = useConfirm();
    return <button type="button" id="ask" onClick={async () => onResult(await confirm(options))}>ask</button>;
  }
  const ask = async (options, pick) => {
    const onResult = vi.fn();
    const { container } = render(<ConfirmDialogProvider><Probe onResult={onResult} options={options} /></ConfirmDialogProvider>);
    await act(async () => { container.querySelector("#ask").click(); });
    const buttons = [...document.querySelectorAll(".ui-modal-foot button")];
    await act(async () => { pick(buttons).click(); });
    return { onResult, buttons };
  };
  it("resolves true on confirm", async () => {
    const { onResult } = await ask({ title: "Sure?", message: "Really", confirmText: "Yes", cancelText: "No" }, (b) => b[1]);
    expect(onResult).toHaveBeenCalledWith(true);
  });
  it("resolves false on cancel", async () => {
    const { onResult, buttons } = await ask({ title: "Sure?", confirmText: "Yes", cancelText: "No" }, (b) => b[0]);
    expect(buttons.map((b) => b.textContent)).toEqual(["No", "Yes"]);
    expect(onResult).toHaveBeenCalledWith(false);
  });
  it("infoOnly shows one button that resolves true", async () => {
    const { onResult, buttons } = await ask({ title: "FYI", message: "ok", confirmText: "Got it", infoOnly: true }, (b) => b[0]);
    expect(buttons).toHaveLength(1);
    expect(onResult).toHaveBeenCalledWith(true);
  });
});
