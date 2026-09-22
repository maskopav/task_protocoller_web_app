// Black-box tests for book.js, the plain-script (no bundler, no exports)
// widget served at public/book.html. There's no build step for this page
// (see book.html's own comment on the base-href detection script), so
// there's nothing to `import` -- instead each test builds a real jsdom
// document from book.html, evaluates book.js's source inside that
// window (same technique a <script> tag would use), and drives it the
// way a participant would: clicking slot buttons, typing into fields,
// clicking Next. What's asserted are the two contracts BookingStep.jsx
// (the parent app embedding this page in an iframe) depends on: that
// window.parent.postMessage({ source: "booking-service", status:
// "completed" }, "*") fires on every path that reaches a real outcome and
// only on those paths, and that next-state messages (mirroring nextBtn's
// own visible/enabled/label state, since that button is hidden here and
// the parent renders its own in a fixed footer instead) and incoming
// next-click messages keep that footer button in sync.
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

// book.js also posts next-state messages (mirroring nextBtn's visible/
// enabled/label state to the parent's own footer button -- see
// BookingStep.jsx) on every choice/input change, so postMessage is no
// longer called exactly once per flow. These tests only care about the
// completion contract, so they filter down to that message specifically.
function completionCalls(postMessageMock) {
  return postMessageMock.mock.calls.filter(([msg]) => msg && msg.status === "completed");
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
    expect(completionCalls(window.parent.postMessage)).toEqual([[COMPLETION_MESSAGE, "*"]]);
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
    expect(completionCalls(window.parent.postMessage)).toEqual([[COMPLETION_MESSAGE, "*"]]);
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
    expect(completionCalls(window.parent.postMessage)).toEqual([]);
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
    expect(completionCalls(window.parent.postMessage)).toEqual([]);
    // Re-enabled so the participant can retry.
    expect(document.getElementById("nextBtn").disabled).toBe(false);
  });
});

// The link is also opened outside any iframe entirely -- straight from an
// emailed link, or the Fieldwork table's link column (see
// docs/reservation-links.md) -- where there is no parent app to render a
// footer button and relay clicks via postMessage. nextBtn must not stay
// hidden in that case, or there is no way to submit at all.
describe("book.js standalone (not embedded in an iframe)", () => {
  it("shows its own Next button when window.parent is itself (not embedded)", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse(oneSlot));
    // setupDom always fakes window.parent as a distinct object to simulate
    // the embedded case -- this test deliberately leaves it as jsdom's
    // default (window.parent === window), matching a real top-level tab.
    const dom = new JSDOM(bookHtml, {
      url: `http://localhost/book/test-slug?tenant=t1`,
      runScripts: "outside-only",
      virtualConsole: new VirtualConsole(),
    });
    const { window } = dom;
    window.bookingI18n = { t: (key) => key, locale: "en" };
    window.fetch = fetchImpl;
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    window.eval(bookJsSource);
    const { document } = window;

    await vi.waitFor(() => {
      expect(document.getElementById("slotStep").classList.contains("hidden")).toBe(false);
    });
    expect(document.getElementById("nextBtn").classList.contains("hidden")).toBe(false);

    document.querySelector(".slot-btn").click();
    fireInput(document.getElementById("email"), "person@example.com");
    fireInput(document.getElementById("phone"), "+1 555 123 4567");
    fetchImpl.mockResolvedValueOnce(
      jsonResponse({ startsAt: "2026-03-01 10:00:00", location: "Room A" })
    );
    document.getElementById("nextBtn").click();

    await vi.waitFor(() => {
      expect(document.getElementById("confirmedStep").classList.contains("hidden")).toBe(false);
    });
  });
});

// Covers the second contract BookingStep.jsx depends on: nextBtn itself is
// hidden inside this page (see book.html), and the parent renders its own
// Next button in a fixed footer outside the iframe instead, driven by these
// { source: "booking-service", type: "next-state", visible, enabled, label }
// messages and a { source: "task-protocoller", type: "next-click" } message
// sent back the other way.
describe("book.js next-state messages to the parent's fixed footer button", () => {
  let fetchImpl;

  beforeEach(() => {
    fetchImpl = vi.fn();
  });

  function nextStateCalls(postMessageMock) {
    return postMessageMock.mock.calls
      .filter(([msg]) => msg && msg.type === "next-state")
      .map(([msg]) => msg);
  }

  it("reports visible-but-disabled right after picking a slot, then enabled once both fields are filled", async () => {
    fetchImpl.mockResolvedValueOnce(jsonResponse(oneSlot));
    const window = setupDom({ fetchImpl });
    const { document } = window;

    await vi.waitFor(() => {
      expect(document.getElementById("slotStep").classList.contains("hidden")).toBe(false);
    });

    document.querySelector(".slot-btn").click();
    expect(nextStateCalls(window.parent.postMessage).at(-1)).toMatchObject({
      visible: true,
      enabled: false,
    });

    fireInput(document.getElementById("email"), "person@example.com");
    fireInput(document.getElementById("phone"), "+1 555 123 4567");
    expect(nextStateCalls(window.parent.postMessage).at(-1)).toMatchObject({
      visible: true,
      enabled: true,
    });
  });

  it("reports disabled with a busy label while submitting, then hides once confirmed", async () => {
    fetchImpl
      .mockResolvedValueOnce(jsonResponse(oneSlot))
      .mockResolvedValueOnce(jsonResponse({ startsAt: "2026-03-01 10:00:00", location: "Room A" }));
    const window = setupDom({ fetchImpl });
    const { document } = window;

    await vi.waitFor(() => {
      expect(document.getElementById("slotStep").classList.contains("hidden")).toBe(false);
    });
    document.querySelector(".slot-btn").click();
    fireInput(document.getElementById("email"), "person@example.com");
    fireInput(document.getElementById("phone"), "+1 555 123 4567");

    document.getElementById("nextBtn").click();
    // handleNext disables nextBtn and swaps its label synchronously, before
    // the async fetch resolves.
    expect(nextStateCalls(window.parent.postMessage).at(-1)).toMatchObject({
      visible: true,
      enabled: false,
      label: "confirmingButton",
    });

    await vi.waitFor(() => {
      expect(document.getElementById("confirmedStep").classList.contains("hidden")).toBe(false);
    });
    expect(nextStateCalls(window.parent.postMessage).at(-1)).toMatchObject({ visible: false });
  });

  it("treats a next-click message from the parent the same as a direct click on nextBtn", async () => {
    fetchImpl
      .mockResolvedValueOnce(jsonResponse(oneSlot))
      .mockResolvedValueOnce(jsonResponse({ startsAt: "2026-03-01 10:00:00", location: "Room A" }));
    const window = setupDom({ fetchImpl });
    const { document } = window;

    await vi.waitFor(() => {
      expect(document.getElementById("slotStep").classList.contains("hidden")).toBe(false);
    });
    document.querySelector(".slot-btn").click();
    fireInput(document.getElementById("email"), "person@example.com");
    fireInput(document.getElementById("phone"), "+1 555 123 4567");

    window.dispatchEvent(
      new window.MessageEvent("message", {
        data: { source: "task-protocoller", type: "next-click" },
      })
    );

    await vi.waitFor(() => {
      expect(document.getElementById("confirmedStep").classList.contains("hidden")).toBe(false);
    });
    expect(completionCalls(window.parent.postMessage)).toEqual([[COMPLETION_MESSAGE, "*"]]);
  });

  it("ignores a next-click message while nextBtn is still disabled", async () => {
    fetchImpl.mockResolvedValueOnce(jsonResponse(oneSlot));
    const window = setupDom({ fetchImpl });
    const { document } = window;

    await vi.waitFor(() => {
      expect(document.getElementById("slotStep").classList.contains("hidden")).toBe(false);
    });
    // No slot picked and no contact info yet -- nextBtn stays disabled.
    window.dispatchEvent(
      new window.MessageEvent("message", {
        data: { source: "task-protocoller", type: "next-click" },
      })
    );

    // Only the initial slots fetch happened -- the ignored message never reached the network.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
