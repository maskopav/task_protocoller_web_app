// @vitest-environment jsdom
// App release page: served version, publish date, per-bundle stable and
// versioned links (PUBLIC_BASE_URL or the browser fallback with a warning),
// copy to clipboard, and the empty state.
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import i18n from "../../i18n";
import { ToastProvider } from "../../components/ui";
import { render, act } from "../../components/ui/renderUtil.jsx";
import AppReleasePage from "./AppReleasePage";
import { formatDateTime } from "../../utils/formatDate";

vi.mock("../../api/appRelease", () => ({ fetchAppRelease: vi.fn() }));
import { fetchAppRelease } from "../../api/appRelease";

const SHA = "ab".repeat(32);
const release = {
  version: "1.0.2",
  publishedAt: "2026-11-13T09:30:00.000Z",
  bundles: [{
    name: "install-windows-x64.zip", size: 157286400, sha256: SHA,
    latestPath: "api/version/download/latest/install-windows-x64.zip",
    versionedPath: "api/version/download/1.0.2/install-windows-x64.zip",
  }],
};

let view;
const $ = (sel) => view.container.querySelector(sel);
const show = async (data) => {
  fetchAppRelease.mockResolvedValue(data);
  view = render(<ToastProvider><AppReleasePage /></ToastProvider>, { route: "/app-release" });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
};

beforeEach(async () => { await i18n.changeLanguage("en"); });
afterEach(() => { view?.unmount(); view = null; vi.clearAllMocks(); });

describe("AppReleasePage", () => {
  it("shows the version, date, bundle details and both links on PUBLIC_BASE_URL", async () => {
    await show({ release, publicBaseUrl: "https://malenia.example/koubic" });
    expect($('[data-testid="apprelease-version"]').textContent).toBe("1.0.2");
    expect(view.container.textContent).toContain(formatDateTime(release.publishedAt, "en"));
    const card = $('[data-testid="apprelease-bundle-install-windows-x64.zip"]');
    expect(card.textContent).toContain("150.0 MB");
    expect(card.querySelector('[data-testid="apprelease-sha256"]').textContent).toBe(SHA);
    expect($('[data-testid="apprelease-stable-link"] .ui-copyfield-val').textContent)
      .toBe("https://malenia.example/koubic/api/version/download/latest/install-windows-x64.zip");
    const versioned = $('[data-testid="apprelease-versioned-link"]');
    expect(versioned.getAttribute("href")).toBe("https://malenia.example/koubic/api/version/download/1.0.2/install-windows-x64.zip");
    expect($('[data-testid="apprelease-no-public-base"]')).toBeNull();
  });

  it("copies the stable link to the clipboard and confirms with a toast", async () => {
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await show({ release, publicBaseUrl: "https://malenia.example/koubic/" });
    await act(async () => { $('[data-testid="apprelease-stable-link"] button').click(); });
    expect(writeText).toHaveBeenCalledWith("https://malenia.example/koubic/api/version/download/latest/install-windows-x64.zip");
    expect(document.body.textContent).toContain("Copied");
  });

  it("without PUBLIC_BASE_URL builds the links from this browser's address and warns", async () => {
    await show({ release, publicBaseUrl: null });
    const base = new URL(".", window.location.href.split("#")[0]).href.replace(/\/+$/, "");
    expect($('[data-testid="apprelease-stable-link"] .ui-copyfield-val').textContent)
      .toBe(`${base}/api/version/download/latest/install-windows-x64.zip`);
    expect($('[data-testid="apprelease-no-public-base"]').textContent).toContain("PUBLIC_BASE_URL is not set");
  });

  it("shows the empty state when no release is published", async () => {
    await show({ release: null, publicBaseUrl: null });
    expect($('[data-testid="apprelease-empty"]').textContent).toContain("No release published");
    expect($('[data-testid="apprelease-stable-link"]')).toBeNull();
  });

  it("names a missing install bundle", async () => {
    await show({ release: { ...release, bundles: [] }, publicBaseUrl: "https://x" });
    expect(view.container.textContent).toContain("This release has no install bundle.");
  });
});
