// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, afterEach, beforeAll } from "vitest";
import i18n from "../../i18n";
import { render, click, act } from "../ui/renderUtil.jsx";
import TaskModal from "./TaskModal";
import TaskList from "./TaskList";
import { defaultLabel, paramText } from "./paramText";
import { protocolSnapshot } from "./snapshot";
import { catalogueField, emptyCustomField } from "../Identifiers/IdentifierFields";
import { validate } from "../../utils/validation";
import * as snapshotModalModule from "./useSnapshotModal";
import { ConfirmDialogProvider } from "../ConfirmDialog/ConfirmDialogContext";

beforeAll(async () => { await i18n.changeLanguage("en"); });
afterEach(() => { document.body.innerHTML = ""; });

const yn = (k) => ({ yes: "Yes", no: "No" }[k]);

describe("boolean defaults read Yes/No (F-007)", () => {
  it("defaultLabel and paramText turn booleans into words", () => {
    expect(defaultLabel({}, true, yn)).toBe("Yes");
    expect(defaultLabel({}, false, yn)).toBe("No");
    expect(defaultLabel({ values: [{ key: "a", label: "Alpha" }] }, "a", yn)).toBe("Alpha");
    expect(defaultLabel({}, ["x", "y"], yn)).toBe("x; y");
    expect(paramText(false, yn)).toBe("No");
    expect(paramText("true", yn)).toBe("Yes");
    expect(paramText(undefined, yn)).toBe("");
    expect(paramText(7, yn)).toBe("7");
  });

  it("the task catalogue never prints a raw true/false", () => {
    const { container } = render(<ConfirmDialogProvider><TaskList onCreate={() => {}} /></ConfirmDialogProvider>);
    const text = container.querySelector(".pe-groups").textContent;
    expect(text).not.toMatch(/\b(true|false)\b/i);
    expect(text).toMatch(/\b(Yes|No)\b/);
  });

  it("adding a task calls onCreate with its category, and the search filters", () => {
    const calls = [];
    const { container } = render(<ConfirmDialogProvider><TaskList onCreate={(c) => calls.push(c)} /></ConfirmDialogProvider>);
    const options = container.querySelectorAll(".pe-option");
    expect(options.length).toBeGreaterThan(3);
    click(options[0].querySelector(".ui-icon-btn"));
    expect(calls).toHaveLength(1);

    const search = container.querySelector('[data-testid="task-search"]');
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(search, "zzzz-no-such-task");
    search.dispatchEvent(new Event("input", { bubbles: true }));
    return Promise.resolve().then(() => {
      expect(container.querySelectorAll(".pe-option").length).toBe(0);
    });
  });
});

describe("protocolSnapshot", () => {
  const base = { name: "A", description: "d", language: "en", required_identifiers: [catalogueField("patient_code")], recordings_file_name: "x", info_text: "", instructions_text: "" };
  it("is stable for equal content and changes with the tasks or a field", () => {
    expect(protocolSnapshot(base, [])).toBe(protocolSnapshot({ ...base }, []));
    expect(protocolSnapshot(base, [{ category: "a" }])).not.toBe(protocolSnapshot(base, []));
    expect(protocolSnapshot({ ...base, description: "e" }, [])).not.toBe(protocolSnapshot(base, []));
  });
  it("treats null and empty text alike, so loading is not 'dirty'", () => {
    expect(protocolSnapshot({ ...base, info_text: null, instructions_pdf_url: null }, [])).toBe(protocolSnapshot(base, []));
  });
});

describe("save-confirm text (F-068)", () => {
  it("describes the config delivery, not the old participant links", () => {
    for (const lang of ["en", "cs", "de"]) {
      const msg = i18n.getFixedT(lang, "admin")("protocolEditor.confirmUpdateMsg");
      expect(msg).not.toMatch(/unique link|unikátní|persönlich|automatically moved/i);
    }
    const en = i18n.getFixedT("en", "admin")("protocolEditor.confirmUpdateMsg");
    expect(en).toMatch(/computers/i);
    expect(en).toMatch(/config/i);
  });
});

describe("TaskModal duration warning (F-073)", () => {
  function Harness({ initial, onSave }) {
    const [data, setData] = React.useState(initial);
    return <TaskModal open creatingNewTask editingTask={null} editingData={data} setEditingData={setData} tasks={[]} onClose={() => {}} onSave={onSave} />;
  }
  const setValue = (input, v) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    act(() => { set.call(input, v); input.dispatchEvent(new Event("input", { bubbles: true })); });
  };
  const numberInputs = () => [...document.body.querySelectorAll('input[type="number"]')];

  it("shows while values contradict, vanishes when fixed, and never blocks Save", () => {
    const saved = [];
    render(<Harness initial={{ category: "retelling", minDuration: 30, maxDuration: 120, duration: 90 }} onSave={(d) => saved.push(d)} />);
    const q = () => document.body.querySelector('[data-testid="task-duration-warning"]');
    expect(q()).toBeNull();

    // find the min/max inputs by their current values
    const min = numberInputs().find((i) => i.value === "30");
    const max = numberInputs().find((i) => i.value === "120");
    setValue(min, "200");
    expect(q()).not.toBeNull();
    expect(q().getAttribute("role")).toBe("alert");

    click(document.body.querySelector('[data-testid="modal-save"]'));
    expect(saved).toHaveLength(1);
    expect(saved[0].minDuration).toBe(200);

    setValue(min, "30");
    expect(q()).toBeNull();
    setValue(max, "60");
    expect(q()).not.toBeNull(); // duration 90 > max 60
  });
});

describe("modal snapshot hook (F-137, F-139)", () => {
  const { useSnapshotModal } = snapshotModalModule;
  const start = { name: "A", required_identifiers: [catalogueField("patient_code")] };
  let api;
  function Harness() {
    const [p, setP] = React.useState(start);
    const modal = useSnapshotModal(p, setP, ["required_identifiers"]);
    api = { p, setP, modal };
    return null;
  }
  const edit = (fn) => act(() => api.setP((prev) => ({ ...prev, required_identifiers: fn(prev.required_identifiers) })));

  it("Cancel after adding a custom field leaves the protocol unchanged", () => {
    render(<Harness />);
    const before = protocolSnapshot(api.p, []);
    act(() => api.modal.openModal());
    edit((l) => [...l, emptyCustomField()]);
    expect(api.p.required_identifiers).toHaveLength(2);
    act(() => api.modal.cancel());
    expect(api.p.required_identifiers).toHaveLength(1);
    expect(api.modal.open).toBe(false);
    expect(protocolSnapshot(api.p, [])).toBe(before);
    expect(validate.protocol({ ...api.p, tasks: [] }).errors.identifiers).toBeUndefined();
  });

  it("Cancel after editing an existing field restores the original", () => {
    render(<Harness />);
    act(() => api.modal.openModal());
    edit((l) => l.map((f) => ({ ...f, required: !f.required, placeholder: "x" })));
    act(() => api.modal.cancel());
    expect(api.p.required_identifiers).toEqual(start.required_identifiers);
  });

  it("Save keeps the edits, and a later Cancel restores only to the new baseline", () => {
    render(<Harness />);
    act(() => api.modal.openModal());
    edit((l) => [...l, { ...emptyCustomField(), name: "site", label: "Site" }]);
    act(() => api.modal.save());
    expect(api.modal.open).toBe(false);
    expect(api.p.required_identifiers.map((f) => f.name)).toEqual(["patient_code", "site"]);
    act(() => api.modal.openModal());
    edit((l) => l.slice(0, 1));
    act(() => api.modal.cancel());
    expect(api.p.required_identifiers.map((f) => f.name)).toEqual(["patient_code", "site"]);
  });

  it("restores every listed key on Cancel, and takes a fresh snapshot on each open", () => {
    let h;
    function Multi() {
      const [p, setP] = React.useState({ info_text: "a", instructions_text: "i", name: "n" });
      const modal = useSnapshotModal(p, setP, ["info_text", "instructions_text"]);
      h = { p, setP, modal };
      return null;
    }
    render(<Multi />);
    act(() => h.modal.openModal());
    act(() => h.setP((x) => ({ ...x, info_text: "b", instructions_text: "j", name: "m" })));
    act(() => h.modal.cancel());
    expect(h.p).toEqual({ info_text: "a", instructions_text: "i", name: "m" });
    act(() => h.modal.openModal());
    act(() => h.setP((x) => ({ ...x, info_text: "c" })));
    act(() => h.modal.save());
    act(() => h.modal.openModal());
    act(() => h.setP((x) => ({ ...x, info_text: "d" })));
    act(() => h.modal.cancel());
    expect(h.p.info_text).toBe("c");
  });
});
