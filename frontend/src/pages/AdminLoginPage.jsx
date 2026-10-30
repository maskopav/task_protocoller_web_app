// frontend/src/pages/AdminLoginPage.jsx — sign-in (docs/ui_redesign/02_spec.md section 6.9).
import React, { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AuthForm from "../components/AuthForm/AuthForm";
import { loginAdmin, adminForgotPasswordApi } from "../api/auth";
import { useUser } from "../context/UserContext";

export default function AdminLoginPage() {
  const { t } = useTranslation("admin");
  const { t: tu } = useTranslation("users");
  const navigate = useNavigate();
  const { user, setUser, login } = useUser();
  const [status, setStatus] = useState({ type: "", message: "" });

  // F-078: a signed-in user is sent on, the session is kept. Sign out and the 401 handler clear
  // localStorage before they land here, so the stored token is what says "signed in"; a stale
  // in-memory user (401 cleared storage only) is dropped, which also prevents a redirect loop.
  const signedIn = !!(user && localStorage.getItem("adminToken"));
  useEffect(() => {
    if (user && !signedIn) setUser(null);
  }, [user, signedIn, setUser]);

  const handleAdminLogin = async (formData) => {
    setStatus({ type: "", message: "" });
    try {
      const res = await loginAdmin(formData);
      if (!(res.success && res.user)) throw new Error("credentials");
      login(res.user, res.token);
      navigate(res.user.must_change_password ? "/setup-account" : "/recordings");
    } catch (err) {
      const text = String(err?.message || "");
      const message = text.includes("deactivated")
        ? t("adminLogin.errorDeactivated")
        : text.includes("credentials") ? t("adminLogin.errorGeneric") : t("adminLogin.errorConnection");
      setStatus({ type: "error", message });
      throw err;
    }
  };

  const handleForgotSubmit = async (email) => {
    setStatus({ type: "", message: "" });
    try {
      await adminForgotPasswordApi(email);
      setStatus({ type: "success", message: t("adminLogin.resetEmailSent") });
    } catch {
      setStatus({ type: "error", message: t("adminLogin.errorConnection") });
    }
  };

  if (signedIn) return <Navigate to={user.must_change_password ? "/setup-account" : "/recordings"} replace />;

  return (
    <AuthForm
      title={tu("auth.loginTitle")}
      lead={tu("auth.purpose")}
      status={status.message ? status : null}
      onLogin={handleAdminLogin}
      onForgot={handleForgotSubmit}
    />
  );
}
