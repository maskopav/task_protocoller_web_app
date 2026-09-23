// @vitest-environment jsdom
// jsdom (not the default 'node' environment) because apiClient.apiFetch
// reads localStorage for the admin JWT -- see adminBooking.test.js for the
// same per-file environment override pattern.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { bulkImportParticipants } from "./participants";

function jsonResponse(body, ok = true, status = ok ? 200 : 400) {
  return { ok, status, json: async () => body };
}

describe("bulkImportParticipants", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    localStorage.setItem("adminToken", "test-jwt");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("posts the file and ids as multipart form data, and returns the result blob", async () => {
    const resultBlob = new Blob(["external_id,participant_id\nEXT-1,42"], { type: "text/csv" });
    globalThis.fetch.mockResolvedValueOnce({ ok: true, status: 200, blob: async () => resultBlob });
    const file = new File(["external_id\nEXT-1"], "ids.csv", { type: "text/csv" });

    const result = await bulkImportParticipants("5", "9", file);

    expect(result).toBe(resultBlob);
    const [url, options] = globalThis.fetch.mock.calls[0];
    expect(url).toMatch(/\/participants\/bulk-import$/);
    expect(options.headers.Authorization).toBe("Bearer test-jwt");
    // apiFetch skips forcing a JSON Content-Type for FormData bodies, so the
    // browser can set its own multipart boundary.
    expect(options.headers["Content-Type"]).toBeUndefined();
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.body.get("project_id")).toBe("5");
    expect(options.body.get("protocol_id")).toBe("9");
    expect(options.body.get("file")).toBe(file);
  });

  it("throws the server error message on failure", async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse({ error: "Cannot add participants to an inactive project." }, false, 403));

    await expect(bulkImportParticipants("5", "9", new File([""], "ids.csv"))).rejects.toThrow(
      "Cannot add participants to an inactive project."
    );
  });

  it("falls back to a generic error message when the failure response has no JSON body", async () => {
    globalThis.fetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => { throw new Error("not json"); } });

    await expect(bulkImportParticipants("5", "9", new File([""], "ids.csv"))).rejects.toThrow("Bulk import failed");
  });
});
