import { describe, it, expect } from "vitest";
import { signHmac, verifyHmac, verifyBookingLink, buildLinkSignaturePayload } from "./linkSigning.js";

describe("signHmac / verifyHmac", () => {
  const secret = "test-secret";

  it("verifies a signature it produced", () => {
    const sig = signHmac(secret, "payload");
    expect(verifyHmac(secret, "payload", sig)).toBe(true);
  });

  it("rejects a tampered payload", () => {
    const sig = signHmac(secret, "payload");
    expect(verifyHmac(secret, "different-payload", sig)).toBe(false);
  });

  it("rejects a tampered signature", () => {
    const sig = signHmac(secret, "payload");
    const tampered = sig.slice(0, -2) + (sig.slice(-2) === "00" ? "11" : "00");
    expect(verifyHmac(secret, "payload", tampered)).toBe(false);
  });

  it("rejects a signature produced with a different secret", () => {
    const sig = signHmac("secret-a", "payload");
    expect(verifyHmac("secret-b", "payload", sig)).toBe(false);
  });

  it("rejects a missing/malformed signature without throwing", () => {
    expect(verifyHmac(secret, "payload", undefined)).toBe(false);
    expect(verifyHmac(secret, "payload", "not-hex-!!")).toBe(false);
    expect(verifyHmac(secret, "payload", "")).toBe(false);
  });
});

describe("verifyBookingLink", () => {
  const secret = "test-secret";
  const fields = { tenantId: "1", resourceSlug: "standardized-room-retest", ref: "participant-42", after: "2026-09-13" };

  function sign(f, exp) {
    return signHmac(secret, buildLinkSignaturePayload({ ...f, exp }));
  }

  it("accepts a valid, unexpired link", () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const sig = sign(fields, exp);
    expect(verifyBookingLink(secret, { ...fields, exp }, sig)).toBe(true);
  });

  it("rejects an expired link even with a correct signature", () => {
    const exp = Math.floor(Date.now() / 1000) - 10;
    const sig = sign(fields, exp);
    expect(verifyBookingLink(secret, { ...fields, exp }, sig)).toBe(false);
  });

  it("rejects a missing exp", () => {
    const sig = sign(fields, "");
    expect(verifyBookingLink(secret, { ...fields, exp: undefined }, sig)).toBe(false);
  });

  it("rejects when any signed field is changed (ref swapped)", () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const sig = sign(fields, exp);
    expect(verifyBookingLink(secret, { ...fields, exp, ref: "someone-else" }, sig)).toBe(false);
  });

  it("rejects when the resourceSlug is changed", () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const sig = sign(fields, exp);
    expect(verifyBookingLink(secret, { ...fields, exp, resourceSlug: "other-resource" }, sig)).toBe(false);
  });

  it("rejects when the after date is pushed earlier (the actual attack this guards against)", () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const sig = sign(fields, exp);
    expect(verifyBookingLink(secret, { ...fields, exp, after: "2020-01-01" }, sig)).toBe(false);
  });
});
