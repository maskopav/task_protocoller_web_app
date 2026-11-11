import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { generatePat, hashPat, isPatFormat } from "./pat.js";

describe("personal access tokens", () => {
  it("generates tpm_ + 43 base64url chars, unique, with its sha256 and prefix", () => {
    const a = generatePat();
    const b = generatePat();
    expect(a.token).toMatch(/^tpm_[A-Za-z0-9_-]{43}$/);
    expect(a.token).not.toBe(b.token);
    expect(a.hash).toBe(crypto.createHash("sha256").update(a.token).digest("hex"));
    expect(a.prefix).toBe(a.token.slice(0, 12));
    expect(hashPat(a.token)).toBe(a.hash);
  });

  it("checks the format before any lookup", () => {
    expect(isPatFormat(generatePat().token)).toBe(true);
    for (const bad of [undefined, null, 42, "", "tpm_", "tpm_abc", "xyz_" + "a".repeat(43), "tpm_" + "a".repeat(44), "tpm_" + "a".repeat(42) + "!"]) {
      expect(isPatFormat(bad)).toBe(false);
    }
  });
});
