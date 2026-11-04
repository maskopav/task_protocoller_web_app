// @vitest-environment jsdom
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    // Like i18next with no translations: defaultValue if given, else the key
    t: (key, opts) => (opts?.returnObjects ? [1, 2, 3, 4].map((n) => `${key}.${n}`) : opts?.defaultValue ?? key),
    i18n: { language: "en" },
  }),
  Trans: ({ defaults }) => defaults,
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
  // Next stays locked on the how-to screen until the clip has played through
  const finishClip = () => act(() => container.querySelector(".smell-howto-video").dispatchEvent(new Event("ended")));

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
    await click(next()); // get-ready screen
    finishClip();
    await click(next()); // how-to screen
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("shows the get-ready text, then the how-to text with the video", async () => {
    act(() => root.render(<SmellTestTask key="fresh" task={{ instructions: "Smell the strip", resolvedParams: { questions: [QUESTION] } }} onNextTask={onNextTask} />));
    const text = () => container.querySelector(".instruction-text").textContent;
    expect(text()).toBe("Smell the strip");
    expect(container.querySelector("h1")).toBeNull();
    expect(container.querySelector(".smell-howto-video")).toBeNull();
    await click(next());
    expect(container.querySelector("h1").textContent).toBe("tasks:smell.howToTitle");
    expect(container.querySelector(".instruction-text")).toBeNull();
    const video = container.querySelector(".smell-howto-video");
    expect(video).not.toBeNull();
    const activeStep = () => container.querySelector(".smell-howto-step.is-active").textContent;
    expect(activeStep()).toBe("tasks:smell.howToSteps.1");
    expect(container.querySelectorAll(".smell-howto-bar")).toHaveLength(4);

    // The caption follows the clip, ending with the repeat step...
    const playTo = (time) => {
      video.currentTime = time;
      act(() => video.dispatchEvent(new Event("timeupdate")));
    };
    playTo(5);
    expect(activeStep()).toBe("tasks:smell.howToSteps.2");
    playTo(20);
    expect(activeStep()).toBe("tasks:smell.howToSteps.4");
    expect(next().disabled).toBe(true);
    // At the end Next unlocks, and the repeat step stays a while before the
    // clip starts over
    vi.useFakeTimers();
    finishClip();
    expect(next().disabled).toBe(false);
    act(() => vi.advanceTimersByTime(2900));
    expect(video.currentTime).toBe(20);
    act(() => vi.advanceTimersByTime(100));
    expect(video.currentTime).toBe(0);
    vi.useRealTimers();
    // ...and a progress bar jumps the clip to its step
    await click(container.querySelectorAll(".smell-howto-bar")[0]);
    expect(video.currentTime).toBe(0);
    expect(activeStep()).toBe("tasks:smell.howToSteps.1");

    // A missing clip lists every step at once
    act(() => video.dispatchEvent(new Event("error")));
    expect(container.querySelector(".smell-howto-video")).toBeNull();
    expect([...container.querySelectorAll(".smell-howto-steps li")].map((li) => li.textContent))
      .toEqual([1, 2, 3, 4].map((n) => `tasks:smell.howToSteps.${n}`));
    await click(next());
    expect(cards()).toHaveLength(3);
  });

  it("unlocks Next on the how-to screen after a while even if the clip never plays", async () => {
    vi.useFakeTimers();
    act(() => root.render(<SmellTestTask key="blocked" task={{ resolvedParams: { questions: [QUESTION] } }} onNextTask={onNextTask} />));
    await click(next());
    expect(next().disabled).toBe(true);
    act(() => vi.advanceTimersByTime(34000));
    expect(next().disabled).toBe(true);
    act(() => vi.advanceTimersByTime(1000));
    expect(next().disabled).toBe(false);
    vi.useRealTimers();
  });

  it("reports the guide clip for each screen and how-to step", async () => {
    const onGuideClip = vi.fn();
    act(() => root.render(
      <SmellTestTask key="guide" task={{ resolvedParams: { questions: [QUESTION] } }}
        onNextTask={onNextTask} onGuideClip={onGuideClip} />
    ));
    expect(onGuideClip).toHaveBeenLastCalledWith("smell");
    await click(next());
    expect(onGuideClip).toHaveBeenLastCalledWith("smell_howto_1");
    const video = container.querySelector(".smell-howto-video");
    video.currentTime = 10;
    act(() => video.dispatchEvent(new Event("timeupdate")));
    expect(onGuideClip).toHaveBeenLastCalledWith("smell_howto_3");
    finishClip();
    await click(next());
    expect(onGuideClip).toHaveBeenLastCalledWith(null); // no clip on the scent screens
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

  it("hands every saved scent to onSaveProgress and marks the final result completed", async () => {
    const onSaveProgress = vi.fn();
    const onLogEvent = vi.fn();
    act(() => root.render(
      <SmellTestTask key="progress" task={{ resolvedParams: { questions: [QUESTION] } }}
        onNextTask={onNextTask} onSaveProgress={onSaveProgress} onLogEvent={onLogEvent} />
    ));
    await click(next());
    finishClip();
    await click(next());
    expect(onLogEvent).toHaveBeenCalledWith("smell_scent_opened", { questionId: "s1", scentNumber: 1 });

    await click(cards()[2]); // No scent
    expect(onSaveProgress).toHaveBeenLastCalledWith({ s1: { scent: "no_scent", label: "No scent" } });
    await click(next());
    expect(onNextTask.mock.calls[0][0]).toMatchObject({ completed: true });
  });

  it("starts a returning respondent over from the intro, with the how-to already unlocked", async () => {
    act(() => root.render(
      <SmellTestTask key="returning" task={{ instructions: "Smell the strip", resolvedParams: { questions: [QUESTION] } }}
        howToSeen onNextTask={onNextTask} />
    ));
    expect(container.querySelector(".instruction-text").textContent).toBe("Smell the strip");
    await click(next());
    expect(container.querySelector(".smell-howto-video")).not.toBeNull();
    expect(next().disabled).toBe(false); // no need to watch the clip again
    await click(next());

    // Scent 1 again, with nothing picked yet
    expect(cards()[0].getAttribute("aria-checked")).toBe("false");
    await click(cards()[2]);
    await click(next());
    expect(onNextTask.mock.calls[0][0].answers).toEqual({ s1: { scent: "no_scent", label: "No scent" } });
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
