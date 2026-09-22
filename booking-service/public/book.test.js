// Black-box tests for book.js, the plain-script (no bundler, no exports)
// widget served at public/book.html. There's no build step for this page
// (see book.html's own comment on the base-href detection script), so
// there's nothing to `import` -- instead each test builds a real jsdom
// document from book.html, evaluates book.js's source inside that
// window (same technique a <script> tag would use), and drives it the
// way a participant would: clicking slot buttons, typing into fields,
// clicking Next. What's asserted is the one contract BookingStep.jsx
// (the parent app embedding this page in an iframe) depends on: that
// window.parent.postMessage({ source: "booking-service", status:
// "completed" }, "*") fires on every path that reaches a real outcome,
// and only on those paths.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { JSDOM, VirtualConsole } from "jsdom";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const bookHtml = fs.readFileSync(path.join(dir, "book.html"), "utf8");
const bookJsSource = fs.readFileSync(path.join(dir, "book.js"), "utf8");

const COMPLETION_MESSAGE = { source: "booking-service", status: "completed" };

function jsonResponse(body, ok = true) {
  return { ok, json: async () => body };
}

// Mirrors a widget mounted at .../book/<slug>?tenant=t1 -- the same shape
// BookingStep.jsx's bookingUrl produces.
function setupDom({ slug = "test-slug", search = "?tenant=t1", fetchImpl }) {
  // jsdom's Location.replace is a real (non-stubbable, non-configurable)
  // navigation attempt with no resource loader behind it here -- it logs a
  // "not implemented" jsdomError instead of throwing, which a silent
  // VirtualConsole (no listeners attached) simply swallows.
  const dom = new JSDOM(bookHtml, {
    url: `http://localhost/book/${slug}${search}`,
    runScripts: "outside-only",
    virtualConsole: new VirtualConsole(),
  });
  const { window } = dom;
  window.bookingI18n = { t: (key) => key, locale: "en" };
  window.fetch = fetchImpl;
  window.parent = { postMessage: vi.fn() };
  // Not implemented in jsdom; only used for the slot list's day headings.
  window.HTMLElement.prototype.scrollIntoView = vi.fn();

  window.eval(bookJsSource);
  return window;
}

function fireInput(el, value) {
  el.value = value;
  el.dispatchEvent(new el.ownerDocument.defaultView.Event("input", { bubbles: true }));
}

const oneSlot = {
  resource: { defaultLocation: "Room A" },
  slots: [{ id: 42, starts_at: "2026-03-01 10:00:00", location: "Room A" }],
  knownContact: null,
};

describe("book.js completion signal to the parent frame", () => {
  let fetchImpl;

  beforeEach(() => {
    fetchImpl = vi.fn();
  });

  it("books a slot and notifies the parent exactly once, with the agreed contract", async () => {
    fetchImpl
      .mockResolvedValueOnce(jsonResponse(oneSlot))
      .mockResolvedValueOnce(
        jsonResponse({ startsAt: "2026-03-01 10:00:00", location: "Room A" })
      );
    const window = setupDom({ fetchImpl });
    const { document } = window;

    await vi.waitFor(() => {
      expect(document.getElementById("slotStep").classList.contains("hidden")).toBe(false);
    });

    document.querySelector(".slot-btn").click();
    fireInput(document.getElementById("email"), "person@example.com");
    fireInput(document.getElementById("phone"), "+1 555 123 4567");
    expect(document.getElementById("nextBtn").disabled).toBe(false);

    document.getElementById("nextBtn").click();

    await vi.waitFor(() => {
      expect(document.getElementById("confirmedStep").classList.contains("hidden")).toBe(false);
    });
    expect(window.parent.postMessage).toHaveBeenCalledTimes(1);
    expect(window.parent.postMessage).toHaveBeenCalledWith(COMPLETION_MESSAGE, "*");
  });

  it("submits the no-slot form and notifies the parent", async () => {
    fetchImpl
      .mockResolvedValueOnce(jsonResponse({ resource: {}, slots: [], knownContact: null }))
      .mockResolvedValueOnce(jsonResponse({}));
    const window = setupDom({ fetchImpl });
    const { document } = window;

    await vi.waitFor(() => {
      expect(document.getElementById("slotStep").classList.contains("hidden")).toBe(false);
    });

    document.getElementById("noSlotToggle").click();
    fireInput(document.getElementById("preferredTimes"), "Any weekday morning");
    fireInput(document.getElementById("email"), "person@example.com");
    fireInput(document.getElementById("phone"), "+1 555 123 4567");
    document.getElementById("nextBtn").click();

    await vi.waitFor(() => {
      expect(document.getElementById("noSlotConfirmedStep").classList.contains("hidden")).toBe(false);
    });
    expect(window.parent.postMessage).toHaveBeenCalledTimes(1);
    expect(window.parent.postMessage).toHaveBeenCalledWith(COMPLETION_MESSAGE, "*");
  });

  it("notifies the parent immediately when the link already has an active booking, before redirecting", async () => {
    fetchImpl.mockResolvedValueOnce(
      jsonResponse({ existingBooking: { manageToken: "tok123" } })
    );
    const window = setupDom({ fetchImpl });

    await vi.waitFor(() => {
      expect(window.parent.postMessage).toHaveBeenCalledTimes(1);
    });
    expect(window.parent.postMessage).toHaveBeenCalledWith(COMPLETION_MESSAGE, "*");
  });

  it("does not notify the parent when contact details fail validation", async () => {
    fetchImpl.mockResolvedValueOnce(jsonResponse(oneSlot));
    const window = setupDom({ fetchImpl });
    const { document } = window;

    await vi.waitFor(() => {
      expect(document.getElementById("slotStep").classList.contains("hidden")).toBe(false);
    });

    document.querySelector(".slot-btn").click();
    fireInput(document.getElementById("email"), "not-an-email");
    fireInput(document.getElementById("phone"), "+1 555 123 4567");
    document.getElementById("nextBtn").click();

    await vi.waitFor(() => {
      expect(document.getElementById("contactError").classList.contains("hidden")).toBe(false);
    });
    expect(document.getElementById("confirmedStep").classList.contains("hidden")).toBe(true);
    // Only the initial slots fetch happened -- the invalid submission never reached the network.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(window.parent.postMessage).not.toHaveBeenCalled();
  });

  it("does not notify the parent when the booking submission fails server-side", async () => {
    fetchImpl
      .mockResolvedValueOnce(jsonResponse(oneSlot))
      .mockResolvedValueOnce(jsonResponse({ error: "slot no longer available" }, false));
    const window = setupDom({ fetchImpl });
    const { document } = window;

    await vi.waitFor(() => {
      expect(document.getElementById("slotStep").classList.contains("hidden")).toBe(false);
    });

    document.querySelector(".slot-btn").click();
    fireInput(document.getElementById("email"), "person@example.com");
    fireInput(document.getElementById("phone"), "+1 555 123 4567");
    document.getElementById("nextBtn").click();

    await vi.waitFor(() => {
      expect(document.getElementById("contactError").classList.contains("hidden")).toBe(false);
    });
    expect(document.getElementById("contactError").textContent).toBe("slot no longer available");
    expect(document.getElementById("confirmedStep").classList.contains("hidden")).toBe(true);
    expect(window.parent.postMessage).not.toHaveBeenCalled();
    // Re-enabled so the participant can retry.
    expect(document.getElementById("nextBtn").disabled).toBe(false);
  });
});
