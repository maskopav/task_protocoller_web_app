// Tiny render helper for kit tests (no @testing-library dependency).
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

export function render(ui, { route = "/" } = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>); });
  return {
    container,
    rerender: (next) => act(() => { root.render(<MemoryRouter initialEntries={[route]}>{next}</MemoryRouter>); }),
    unmount: () => { act(() => root.unmount()); container.remove(); },
  };
}

export const click = (el) => act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); });
export const key = (el, k, init = {}) => act(() => { el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init })); });
export const mousedown = (el) => act(() => { el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); });
export { act };
