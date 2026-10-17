// @vitest-environment jsdom
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key) => key, i18n: { language: "en" } }),
}));

const { default: SmellTestTask } = await import("./SmellTestTask");
const { SMELL_IMAGES } = await import("../../config/smellScents");

const QUESTION = {
  id: "s1", type: "single", text: "Which smell?",
  options: ["Mint", "Rose", "No scent"],
  // a scent key with a picture, a scent key whose picture is missing, "No scent"
  optionImages: { Mint: "mint", Rose: "rose_missing", "No scent": "no_scent" },
};

describe("SmellTestTask", () => {
  let container, root, onNextTask;
  const cards = () => container.querySelectorAll(".scent-option");
  const sheet = () => document.querySelector(".scent-sheet");
  const ratingOptions = () => document.querySelectorAll(".scent-rating-option");
  const next = () => container.querySelector(".btn-next");
  // SafeButton awaits its handler and debounces repeat taps
  const click = (el) => act(async () => el.click());

  beforeEach(async () => {
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => (now += 1000));
    container = document.createElement("div");
    document.body.appendChild(container);
    onNextTask = vi.fn();
    const task = { instructions: "Smell the strip", resolvedParams: { questions: [QUESTION] } };
    act(() => {
      root = createRoot(container);
      root.render(<SmellTestTask task={task} onNextTask={onNextTask} />);
    });
    await click(next()); // past the instructions screen
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("renders one picture card per option", () => {
    expect(cards()).toHaveLength(3);
    expect(cards()[0].querySelector("img").getAttribute("src")).toBe(SMELL_IMAGES.mint);
    expect(cards()[1].querySelector(".scent-option-image")).toBeNull();
    expect(cards()[2].querySelector("img").getAttribute("src")).toBe(SMELL_IMAGES.no_scent);
    expect(next().disabled).toBe(true);
  });

  it("asks intensity then pleasantness, and saves the scent only once both are picked", async () => {
    await click(cards()[0]);
    expect(sheet().querySelector(".scent-sheet-title").textContent).toBe("smell.intensity.title");
    await click(ratingOptions()[2]); // Strong
    expect(sheet().querySelector(".scent-sheet-title").textContent).toBe("smell.pleasantness.title");

    // Closing midway discards the half-rated scent
    await click(document.querySelector(".scent-sheet-icon-btn.is-close"));
    expect(sheet()).toBeNull();
    expect(cards()[0].getAttribute("aria-checked")).toBe("false");

    await click(cards()[0]);
    await click(ratingOptions()[2]);
    await click(ratingOptions()[3]); // Pleasant
    expect(sheet()).toBeNull();
    expect(cards()[0].getAttribute("aria-checked")).toBe("true");
    expect(cards()[0].querySelector(".scent-option-badge")).not.toBeNull();

    await click(next());
    expect(onNextTask.mock.calls[0][0]).toMatchObject({
      taskType: "smell",
      answers: { s1: { scent: "mint", label: "Mint", intensity: 3, pleasantness: 4 } },
    });
  });

  it("re-opens a rated scent with its saved ratings, and Back returns to the previous step", async () => {
    await click(cards()[0]);
    await click(ratingOptions()[0]);
    await click(ratingOptions()[4]);

    await click(cards()[0]);
    expect(ratingOptions()[0].getAttribute("aria-checked")).toBe("true");
    await click(ratingOptions()[1]);
    await click(document.querySelector(".scent-sheet-icon-btn.is-back"));
    expect(ratingOptions()[1].getAttribute("aria-checked")).toBe("true");
  });

  it("saves No scent straight away, replacing an earlier rated scent", async () => {
    await click(cards()[0]);
    await click(ratingOptions()[0]);
    await click(ratingOptions()[0]);
    await click(cards()[2]);
    expect(sheet()).toBeNull();

    await click(next());
    expect(onNextTask.mock.calls[0][0].answers).toEqual({ s1: { scent: "no_scent", label: "No scent" } });
  });
});
