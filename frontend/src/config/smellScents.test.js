import { describe, it, expect } from "vitest";
import { SMELL_IMAGES, SMELL_SCENT_KEYS, NO_SCENT_KEY, scentLabel } from "./smellScents";

// Mimics i18next: returns defaultValue when the key isn't translated
const t = (key, { defaultValue }) => (key === "smell.scents.rose" ? "Růže" : defaultValue);

describe("smellScents", () => {
  it("discovers pictures by file name, keeping 'No scent' out of the pickable list", () => {
    expect(SMELL_IMAGES[NO_SCENT_KEY]).toBeTruthy();
    expect(SMELL_SCENT_KEYS).not.toContain(NO_SCENT_KEY);
  });

  it("labels a scent from its translation, else from its file name", () => {
    expect(scentLabel("rose", t)).toBe("Růže");
    expect(scentLabel("hot_dog", t)).toBe("Hot dog");
    expect(scentLabel(NO_SCENT_KEY, t)).toBe("No scent");
  });
});
