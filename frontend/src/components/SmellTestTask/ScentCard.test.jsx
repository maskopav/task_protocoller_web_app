// @vitest-environment jsdom
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key, opts) => `${key} ${opts?.current}/${opts?.total}` }),
}));

const { default: ScentCard } = await import("./ScentCard");

describe("ScentCard", () => {
  let container, root;
  const render = (props) => act(() => root.render(<ScentCard {...props} />));
  const spots = () => [...container.querySelectorAll(".scent-card-spot")];
  const states = () => spots().map((s) => s.classList[1]);

  beforeEach(() => {
    container = document.createElement("div");
    act(() => { root = createRoot(container); });
  });

  afterEach(() => act(() => root.unmount()));

  it("marks smelled scents done, the current one current, the rest next", () => {
    render({ count: 5, current: 2 });
    expect(states()).toEqual(["is-done", "is-done", "is-current", "is-next", "is-next"]);
    expect(spots()[0].querySelector(".scent-card-check")).not.toBeNull();
    expect(spots()[3].textContent).toBe("4");
    expect(container.querySelector("svg").getAttribute("aria-label")).toBe("smell.card.progress 3/5");
  });

  it("moves the cursor to the current spot", () => {
    render({ count: 8, current: 0 });
    const cursor = () => container.querySelector(".scent-card-cursor").style.transform;
    const first = cursor();
    render({ count: 8, current: 7 });
    expect(spots()).toHaveLength(8);
    expect(cursor()).not.toBe(first);
  });

  it("preview draws the plain card: numbered spots, no progress", () => {
    render({ count: 5, preview: true });
    expect(container.querySelector(".scent-card.is-preview")).not.toBeNull();
    expect(spots().map((s) => s.textContent)).toEqual(["1", "2", "3", "4", "5"]);
    expect(container.querySelector(".scent-card-cursor, .scent-card-check, .is-current")).toBeNull();
  });

  it("renders nothing for a single scent", () => {
    render({ count: 1, current: 0 });
    expect(container.querySelector("svg")).toBeNull();
  });
});
