import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { apiErrorMessage } from "./apiError.js";

const i18nDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../i18n");
// A minimal t() over the real admin.json of a language: key lookup with defaultValue fallback.
const tFor = (lng) => {
  const admin = JSON.parse(fs.readFileSync(path.join(i18nDir, lng, "admin.json"), "utf8"));
  return (key, opts = {}) => key.split(".").reduce((o, k) => o?.[k], admin) ?? opts.defaultValue ?? key;
};

describe("apiErrorMessage", () => {
  it.each(["en", "cs", "de"])("%s: task_invalid has wording, not the bare code", (lng) => {
    const msg = apiErrorMessage({ code: "task_invalid" }, tFor(lng));
    expect(msg).not.toBe("task_invalid");
    expect(msg.length).toBeGreaterThan(20);
  });

  it("en: task_invalid explains how to recover", () => {
    expect(apiErrorMessage({ code: "task_invalid" }, tFor("en")))
      .toBe("A task in this protocol is not valid. Remove it and add it again.");
  });

  it("falls back to the code for an unknown code", () => {
    expect(apiErrorMessage({ code: "something_else" }, tFor("en"))).toBe("something_else");
  });
});
