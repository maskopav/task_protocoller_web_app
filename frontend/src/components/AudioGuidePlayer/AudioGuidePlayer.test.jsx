// @vitest-environment jsdom
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import AudioGuidePlayer from "./AudioGuidePlayer";

// iOS Safari only autoplays an <audio> element that has played before, so a
// stretch without a clip (the page guide during the D-15 tests, a smell scent
// screen) must not replace the element: the next clip then didn't autoplay.
describe("AudioGuidePlayer", () => {
  let container, root, play, pause;
  const render = (props) => act(() => root.render(<AudioGuidePlayer playOnMount={false} {...props} />));
  const audio = () => container.querySelector("audio");
  const button = () => container.querySelector(".audio-instructions-btn");

  beforeEach(() => {
    play = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
    pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    container = document.createElement("div");
    document.body.appendChild(container);
    act(() => { root = createRoot(container); });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("keeps the same element through a stretch without a clip, and plays the next one on it", () => {
    render({ src: "/a.m4a", playTrigger: 1 });
    render({ src: "/a.m4a", playTrigger: 2 });
    const element = audio();
    expect(play).toHaveBeenCalledTimes(1);

    render({ src: null, playTrigger: 2 });
    expect(audio()).toBe(element);
    expect(audio().hasAttribute("src")).toBe(false);
    expect(button()).toBeNull();
    expect(pause).toHaveBeenCalled();

    render({ src: "/b.m4a", playTrigger: 3 });
    expect(audio()).toBe(element);
    expect(audio().getAttribute("src")).toBe("/b.m4a");
    expect(play).toHaveBeenCalledTimes(2);
    expect(button()).not.toBeNull();
  });

  it("keeps the element when a clip fails to load, hiding only the button", () => {
    render({ src: "/missing.m4a", playTrigger: 1 });
    const element = audio();
    act(() => element.dispatchEvent(new Event("error")));
    expect(button()).toBeNull();
    expect(audio()).toBe(element);
  });
});
