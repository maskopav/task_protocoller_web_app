import { describe, it, expect } from "vitest";
import { resolveColumnVisibility } from "./useColumnVisibility";

const DEFS = [
  { id: "participant", required: true },
  { id: "protocol" },
  { id: "sessionId", defaultVisible: false },
  { id: "contactConsent" },
];

const sorted = (set) => [...set].sort();

describe("resolveColumnVisibility", () => {
  it("falls back to defaults when nothing is stored", () => {
    const { visible, known } = resolveColumnVisibility(null, DEFS);
    expect(sorted(visible)).toEqual(["contactConsent", "participant", "protocol"]);
    expect(sorted(known)).toEqual(["contactConsent", "participant", "protocol", "sessionId"]);
  });

  it("falls back to defaults for an unrecognised shape", () => {
    const { visible } = resolveColumnVisibility({ foo: 1 }, DEFS);
    expect(sorted(visible)).toEqual(["contactConsent", "participant", "protocol"]);
  });

  it("keeps saved choices for columns the viewer already knew about", () => {
    const stored = {
      visible: ["participant", "sessionId"],
      known: ["participant", "protocol", "sessionId", "contactConsent"],
    };
    const { visible } = resolveColumnVisibility(stored, DEFS);
    expect(sorted(visible)).toEqual(["participant", "sessionId"]);
  });

  it("shows a new default-visible column the viewer has never seen", () => {
    const stored = { visible: ["participant"], known: ["participant", "protocol", "sessionId"] };
    const { visible, known } = resolveColumnVisibility(stored, DEFS);
    expect(sorted(visible)).toEqual(["contactConsent", "participant"]);
    expect(known.has("contactConsent")).toBe(true);
  });

  it("leaves a new hidden-by-default column hidden", () => {
    const stored = { visible: ["participant"], known: ["participant", "protocol", "contactConsent"] };
    const { visible } = resolveColumnVisibility(stored, DEFS);
    expect(visible.has("sessionId")).toBe(false);
  });

  it("keeps known ids for columns currently switched off by a feature flag", () => {
    const stored = { visible: ["participant"], known: ["participant", "reservation"] };
    const { known } = resolveColumnVisibility(stored, DEFS);
    expect(known.has("reservation")).toBe(true);
  });

  it("migrates the legacy bare-array format, treating only post-legacy columns as new", () => {
    const { visible } = resolveColumnVisibility(["participant"], DEFS);
    // protocol was hidden by the user before -> stays hidden; contactConsent is new -> shown
    expect(sorted(visible)).toEqual(["contactConsent", "participant"]);
  });
});
