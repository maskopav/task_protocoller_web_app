// src/components/AuthForm/ResetPasswordModal.jsx — the page behind /reset-password/:token (name kept for the route import).
import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { adminResetPasswordApi } from "../../api/auth";
import { Button, TextField } from "../ui";
import AuthCard from "./AuthCard";

export default function ResetPasswordModal() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation(["common"]);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [state, setState] = useState({ loading: false, error: "", success: false });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) {
      setState({ loading: false, error: t("auth.passwordMismatch"), success: false });
      return;
    }
    setState({ loading: true, error: "", success: false });
    try {
      await adminResetPasswordApi(token, password);
      setState({ loading: false, error: "", success: true });
      setTimeout(() => navigate("/login", { replace: true }), 3000);
    } catch (err) {
      setState({ loading: false, error: err.message, success: false });
    }
  };

  const status = state.success
    ? { type: "success", message: `${t("auth.passwordUpdateSuccess")} ${t("auth.redirectingToLogin")}` }
    : state.error ? { type: "error", message: state.error } : null;

  return (
    <AuthCard title={t("auth.resetPasswordTitle")} status={status} data-testid="reset-card">
      {!state.success && (
        <form onSubmit={handleSubmit} className="auth-form">
          <TextField
            label={t("auth.newPassword")} required autoComplete="new-password"
            type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
          />
          <TextField
            label={t("auth.confirmPassword")} required autoComplete="new-password"
            type={showPassword ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)}
          />
          <div className="auth-link">
            <Button variant="quiet" size="sm" onClick={() => setShowPassword((s) => !s)}>
              {showPassword ? t("auth.hide") : t("auth.show")}
            </Button>
          </div>
          <Button variant="primary" type="submit" disabled={state.loading}>
            {state.loading ? t("auth.processing") : t("auth.btnSetNewPassword")}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
