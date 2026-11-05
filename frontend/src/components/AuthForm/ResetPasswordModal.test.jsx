// @vitest-environment jsdom
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key) => key, i18n: { language: "en" } }),
}));

const { resetPassword, adminResetPasswordApi } = vi.hoisted(() => ({
  resetPassword: vi.fn(),
  adminResetPasswordApi: vi.fn(),
}));
vi.mock("../../api/auth", () => ({ resetPassword, adminResetPasswordApi }));
vi.mock("../LanguageSwitcher/LanguageSwitcher", () => ({ LanguageSwitcher: () => null }));
vi.mock("../DashboardTopBar/DashboardTopBar", () => ({ default: () => null }));

const { default: ResetPasswordModal } = await import("./ResetPasswordModal");

// React only tracks controlled-input changes made through the native setter.
function typeInto(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("ResetPasswordModal", () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    resetPassword.mockReset().mockResolvedValue({ success: true });
    adminResetPasswordApi.mockReset().mockResolvedValue({ success: true });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function renderPage({ isAdmin = false, url = "/reset-password/tok123?returnToken=proto1" } = {}) {
    await act(async () => {
      root = createRoot(container);
      root.render(
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/reset-password/:token" element={<ResetPasswordModal />} />
            <Route path="/admin/reset-password/:token" element={<ResetPasswordModal isAdmin={isAdmin} />} />
            <Route path="/protocol/:token" element={<div id="participant-login" />} />
            <Route path="/login" element={<div id="admin-login" />} />
            <Route path="/" element={<div id="home" />} />
          </Routes>
        </MemoryRouter>
      );
    });
  }

  const newPw = () => container.querySelector("#reset-new-password");
  const confirmPw = () => container.querySelector("#reset-confirm-password");
  const submit = async () => {
    await act(async () => {
      container.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
  };

  it("renders both password fields with their own show/hide toggle", async () => {
    await renderPage();
    expect(newPw().type).toBe("password");
    expect(confirmPw().type).toBe("password");

    const toggles = container.querySelectorAll(".password-toggle");
    expect(toggles).toHaveLength(2);
    await act(async () => toggles[1].click());
    expect(newPw().type).toBe("password");
    expect(confirmPw().type).toBe("text");
  });

  it("shows a field error and does not call the API when passwords differ", async () => {
    await renderPage();
    await act(async () => {
      typeInto(newPw(), "secret-one");
      typeInto(confirmPw(), "secret-two");
    });
    await submit();

    expect(resetPassword).not.toHaveBeenCalled();
    expect(confirmPw().classList.contains("input-error")).toBe(true);
    expect(container.textContent).toContain("auth.passwordMismatch");
  });

  it("flags empty fields as required", async () => {
    await renderPage();
    await submit();

    expect(resetPassword).not.toHaveBeenCalled();
    expect(container.querySelectorAll(".field-error-text")).toHaveLength(2);
  });

  it("resets a participant password and offers a way back to the protocol login", async () => {
    await renderPage();
    await act(async () => {
      typeInto(newPw(), "new-secret");
      typeInto(confirmPw(), "new-secret");
    });
    await submit();

    expect(resetPassword).toHaveBeenCalledWith("tok123", "new-secret");
    expect(container.textContent).toContain("auth.passwordUpdateSuccess");

    await act(async () => container.querySelector(".reset-success .btn-green").click());
    expect(container.querySelector("#participant-login")).toBeTruthy();
  });

  it("uses the admin endpoint and admin login on the admin route", async () => {
    await renderPage({ isAdmin: true, url: "/admin/reset-password/adm456" });
    await act(async () => {
      typeInto(newPw(), "admin-secret");
      typeInto(confirmPw(), "admin-secret");
    });
    await submit();

    expect(adminResetPasswordApi).toHaveBeenCalledWith("adm456", "admin-secret");
    expect(resetPassword).not.toHaveBeenCalled();

    await act(async () => container.querySelector(".reset-success .btn-green").click());
    expect(container.querySelector("#admin-login")).toBeTruthy();
  });

  it("explains an expired link instead of showing the raw server error", async () => {
    resetPassword.mockRejectedValue(new Error("Invalid or expired token"));
    await renderPage();
    await act(async () => {
      typeInto(newPw(), "new-secret");
      typeInto(confirmPw(), "new-secret");
    });
    await submit();

    const alert = container.querySelector(".validation-error-msg");
    expect(alert.textContent).toBe("auth.resetLinkInvalid");
    expect(container.textContent).not.toContain("Invalid or expired token");
  });

  it("ignores a returnToken of 'undefined' from the reset e-mail", async () => {
    await renderPage({ url: "/reset-password/tok123?returnToken=undefined" });
    await act(async () => container.querySelector(".reset-back-link").click());
    expect(container.querySelector("#participant-login")).toBeFalsy();
    expect(container.querySelector("#home")).toBeTruthy();
  });
});
