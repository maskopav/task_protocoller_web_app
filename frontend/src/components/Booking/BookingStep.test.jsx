// @vitest-environment jsdom
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key) => key, i18n: { language: "en" } }),
}));

const { getBookingLink } = vi.hoisted(() => ({ getBookingLink: vi.fn() }));
const { markSessionCompleted } = vi.hoisted(() => ({ markSessionCompleted: vi.fn() }));
vi.mock("../../api/booking", () => ({ getBookingLink }));
vi.mock("../../api/sessions", () => ({ markSessionCompleted }));

const { default: BookingStep } = await import("./BookingStep");

const BOOKING_URL = "http://booking.example.com/book/xyz?sig=abc";
const COMPLETION_MESSAGE = { source: "booking-service", status: "completed" };

function postToWindow(origin, data) {
  window.dispatchEvent(new MessageEvent("message", { origin, data }));
}

describe("BookingStep", () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    markSessionCompleted.mockReset().mockResolvedValue(undefined);
    getBookingLink.mockReset().mockResolvedValue({ bookingUrl: BOOKING_URL });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function renderStep(props = {}) {
    await act(async () => {
      root = createRoot(container);
      root.render(<BookingStep sessionId="s1" onComplete={vi.fn()} {...props} />);
    });
  }

  it("shows the preview badge and an immediately-available Continue button in testing mode, without calling the booking API", async () => {
    await renderStep({ testingMode: true });

    expect(container.querySelector(".booking-step-preview-badge")).toBeTruthy();
    expect(container.querySelector(".booking-step-continue")).toBeTruthy();
    expect(markSessionCompleted).not.toHaveBeenCalled();
    expect(getBookingLink).not.toHaveBeenCalled();
  });

  it("loads the booking iframe and keeps Continue hidden until the widget reports completion", async () => {
    await renderStep();

    await vi.waitFor(() => {
      expect(container.querySelector(".booking-step-iframe")).toBeTruthy();
    });
    const iframe = container.querySelector(".booking-step-iframe");
    expect(iframe.getAttribute("src")).toBe(BOOKING_URL);
    expect(container.querySelector(".booking-step-continue")).toBeNull();
  });

  it("reveals Continue once booking-service posts a completion message from the iframe's own origin, and Continue triggers onComplete", async () => {
    const onComplete = vi.fn();
    await renderStep({ onComplete });
    await vi.waitFor(() => expect(container.querySelector(".booking-step-iframe")).toBeTruthy());

    await act(async () => {
      postToWindow(new URL(BOOKING_URL).origin, COMPLETION_MESSAGE);
    });

    const continueBtn = container.querySelector(".booking-step-continue");
    expect(continueBtn).toBeTruthy();
    await act(async () => {
      continueBtn.click();
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("ignores a completion message from an unexpected origin", async () => {
    await renderStep();
    await vi.waitFor(() => expect(container.querySelector(".booking-step-iframe")).toBeTruthy());

    await act(async () => {
      postToWindow("http://evil.example.com", COMPLETION_MESSAGE);
    });

    expect(container.querySelector(".booking-step-continue")).toBeNull();
  });

  it("ignores a same-origin message that doesn't match the completion contract", async () => {
    await renderStep();
    await vi.waitFor(() => expect(container.querySelector(".booking-step-iframe")).toBeTruthy());

    await act(async () => {
      postToWindow(new URL(BOOKING_URL).origin, { source: "booking-service", status: "in-progress" });
    });

    expect(container.querySelector(".booking-step-continue")).toBeNull();
  });

  it("shows an error and no iframe or Continue button when the booking link fails to load", async () => {
    getBookingLink.mockRejectedValue(new Error("nope"));
    await renderStep();

    await vi.waitFor(() => {
      expect(container.querySelector(".booking-step-error")).toBeTruthy();
    });
    expect(container.querySelector(".booking-step-iframe")).toBeNull();
    expect(container.querySelector(".booking-step-continue")).toBeNull();
  });
});
