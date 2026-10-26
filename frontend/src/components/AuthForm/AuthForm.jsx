// src/components/AuthForm/AuthForm.jsx — email + password sign-in, with a "forgot password" mode.
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { validate } from "../../utils/validation";
import { Button, TextField } from "../ui";
import AuthCard from "./AuthCard";

export default function AuthForm({ title, lead, status, onLogin, onForgot }) {
  const { t } = useTranslation(["common"]);
  const [mode, setMode] = useState("login");
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);

  const msg = (key) => (key ? t(`auth.${key}`) : "");

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((d) => ({ ...d, [name]: value }));
    if (fieldErrors[name]) setFieldErrors((f) => ({ ...f, [name]: "" }));
  };

  const handleBlur = (e) => {
    const { name, value } = e.target;
    setFieldErrors((f) => ({ ...f, [name]: msg(validate.auth.field(name, value, true)) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = {};
    const emailKey = validate.auth.field("email", formData.email, true);
    if (emailKey) errors.email = msg(emailKey);
    if (mode === "login") {
      const passKey = validate.auth.field("password", formData.password, true);
      if (passKey) errors.password = msg(passKey);
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setLoading(true);
    try {
      if (mode === "forgot") await onForgot(formData.email);
      else await onLogin(formData);
    } catch {
      // The page shows the failure in its status box.
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard title={title} lead={lead} status={status} data-testid="login-card">
      <form onSubmit={handleSubmit} className="auth-form" noValidate>
        <TextField
          label={t("auth.email")} type="email" name="email" autoComplete="username" required
          placeholder="name@example.org"
          value={formData.email} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.email || undefined}
        />

        {mode === "login" && (
          <>
            <TextField
              label={t("auth.password")} name="password" autoComplete="current-password" required
              type={showPassword ? "text" : "password"}
              value={formData.password} onChange={handleChange} error={fieldErrors.password || undefined}
            />
            <div className="auth-link">
              <Button variant="quiet" size="sm" onClick={() => setShowPassword((s) => !s)}>
                {showPassword ? t("auth.hide") : t("auth.show")}
              </Button>
              {onForgot && (
                <Button variant="quiet" size="sm" onClick={() => setMode("forgot")} data-testid="forgot-link">
                  {t("auth.forgotPasswordLink")}
                </Button>
              )}
            </div>
          </>
        )}

        {mode === "forgot" && <p className="auth-lead">{t("auth.forgotPasswordInstruction")}</p>}

        <Button variant="primary" type="submit" disabled={loading} data-testid="auth-submit">
          {loading ? t("auth.processing") : mode === "login" ? t("auth.btnLogin") : t("auth.btnSendResetLink")}
        </Button>

        {mode === "forgot" && <Button onClick={() => setMode("login")}>{t("auth.btnBackToLogin")}</Button>}
      </form>
    </AuthCard>
  );
}
