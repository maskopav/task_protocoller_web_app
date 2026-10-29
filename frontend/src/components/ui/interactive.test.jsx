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

describe("Menu placement", () => {
  const items = [{ label: "Edit" }, { label: "Delete" }];
  const rect = (o) => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, ...o });
  const viewport = () => {   // jsdom reports 0 for clientWidth/clientHeight
    vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(window.innerWidth);
    vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(window.innerHeight);
  };
  const stub = (triggerRect, popH = 100, popW = 150) => {
    viewport();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      return this.getAttribute?.("aria-haspopup") ? rect(triggerRect) : rect({});
    });
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(popH);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(popW);
  };
  afterEach(() => vi.restoreAllMocks());

  it("focuses the first item without scrolling", () => {
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    const { container } = render(<Menu label="m" items={items} />);
    click(container.querySelector("button"));
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("opens below the trigger when there is room", () => {
    stub({ top: 100, bottom: 130, left: 500, right: 530 });
    const { container } = render(<Menu label="m" items={items} />);
    click(container.querySelector("button"));
    expect(container.querySelector('[role="menu"]').style.top).toBe("134px");
  });

  it("opens upward when there is no room below, and stays on screen", () => {
    stub({ top: window.innerHeight - 40, bottom: window.innerHeight - 10, left: 500, right: 530 });
    const { container } = render(<Menu label="m" items={items} />);
    click(container.querySelector("button"));
    expect(container.querySelector('[role="menu"]').style.top).toBe(`${window.innerHeight - 40 - 4 - 100}px`);
  });

  it("re-places on scroll, ignores scrolls inside the popup, closes when the trigger leaves the viewport", () => {
    const t = { top: 100, bottom: 130, left: 500, right: 530 };
    stub(t);
    const { container } = render(<Menu label="m" items={items} />);
    click(container.querySelector("button"));
    const menu = () => container.querySelector('[role="menu"]');
    t.top = 80; t.bottom = 110;
    act(() => { document.body.dispatchEvent(new Event("scroll")); });
    expect(menu().style.top).toBe("114px");
    act(() => { menu().dispatchEvent(new Event("scroll")); });
    expect(menu()).not.toBeNull();
    t.top = -80; t.bottom = -50;
    act(() => { document.body.dispatchEvent(new Event("scroll")); });
    expect(menu()).toBeNull();
  });

  it("right-aligns a wide popup to the trigger's right edge, inside clientWidth", () => {
    const cw = window.innerWidth;
    stub({ top: 100, bottom: 130, left: cw - 40, right: cw - 10 }, 100, 320);
    const { container } = render(<Menu label="m" items={items} />);
    click(container.querySelector("button"));
    const m = container.querySelector('[role="menu"]');
    const left = parseFloat(m.style.left);
    expect(left + 320).toBe(cw - 10);
    expect(left + 320).toBeLessThanOrEqual(cw);
  });

  it("measures the hidden first frame at the origin and clamps to clientWidth/clientHeight", () => {
    const seen = [];
    stub({ top: 100, bottom: 130, left: 570, right: 595 }, 100, 320);
    vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function () {
      if (this.getAttribute("role") === "menu") seen.push({ left: this.style.left, top: this.style.top, vis: this.style.visibility });
      return 320;
    });
    const { container } = render(<Menu label="m" items={items} align="left" />);
    click(container.querySelector("button"));
    expect(seen[0]).toEqual({ left: "0px", top: "0px", vis: "hidden" });
    expect(parseFloat(container.querySelector('[role="menu"]').style.left)).toBe(276);   // clamped to clientWidth 600 - 320 - 4 gap (innerWidth would allow 570)
  });

  it("re-places when the popup's own size changes after opening", () => {
    let cb;
    const disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class { constructor(f) { cb = f; } observe() {} disconnect() { disconnect(); } });
    viewport();
    const size = { w: 150 };
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      return this.getAttribute?.("aria-haspopup") ? rect({ top: 100, bottom: 130, left: 500, right: 530 }) : rect({});
    });
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(() => size.w);
    const { container, unmount } = render(<Menu label="m" items={items} />);
    click(container.querySelector("button"));
    const m = () => container.querySelector('[role="menu"]');
    expect(m().style.left).toBe("380px");
    size.w = 300;
    act(() => { cb(); });
    expect(m().style.left).toBe("230px");
    unmount();
    expect(disconnect).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("keeps keyboard focus on the item the user moved to when a scroll re-places the popup", () => {
    const t = { top: 100, bottom: 130, left: 500, right: 530 };
    stub(t);
    const { container } = render(<Menu label="m" items={[{ label: "Edit" }, { label: "Copy" }, { label: "Delete" }]} />);
    click(container.querySelector("button"));
    const els = () => [...container.querySelectorAll('[role="menuitem"]')];
    expect(document.activeElement).toBe(els()[0]);
    act(() => { els()[1].focus(); });
    t.top = 80; t.bottom = 110;
    act(() => { document.body.dispatchEvent(new Event("scroll")); });
    expect(container.querySelector('[role="menu"]').style.top).toBe("114px");
    expect(document.activeElement).toBe(els()[1]);
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
