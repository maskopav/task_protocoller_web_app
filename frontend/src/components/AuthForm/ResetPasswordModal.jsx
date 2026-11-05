// frontend/src/components/AuthForm/ResetPasswordModal.jsx
//
// Full-page "set a new password" screen reached from the reset e-mail link
// (participants: /reset-password/:token, admins: /admin/reset-password/:token).
// It reuses the login screen's layout and form styles (AuthForm.css) so both
// look the same. The route is lazy-loaded on its own, so it has to import
// AuthForm.css itself -- otherwise the shared input/toggle classes are missing.
import React, { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { resetPassword, adminResetPasswordApi } from "../../api/auth";
import { LanguageSwitcher } from "../LanguageSwitcher/LanguageSwitcher";
import DashboardTopBar from "../DashboardTopBar/DashboardTopBar";
import "./AuthForm.css";
import "./ResetPasswordModal.css";

const REDIRECT_DELAY_MS = 3000;

function PasswordField({ id, name, label, value, error, visible, onToggle, onChange, onBlur, autoFocus, t }) {
  return (
    <div className="form-field">
      <label className="form-label" htmlFor={id}>{label}</label>
      <div className="password-wrapper">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          autoFocus={autoFocus}
          className={`participant-input ${error ? "input-error" : ""}`}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          aria-invalid={!!error}
        />
        <button type="button" className="password-toggle" onClick={onToggle} aria-pressed={visible}>
          {visible ? t("auth.hide") : t("auth.show")}
        </button>
      </div>
      {error && <span className="field-error-text">{error}</span>}
    </div>
  );
}

export default function ResetPasswordModal({ isAdmin = false }) {
  const { token } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation(["common"]);

  // Protocol token the participant came from. The reset e-mail always appends
  // ?returnToken=..., which reads "undefined" when none was known.
  const rawReturnToken = searchParams.get("returnToken");
  const returnToken = rawReturnToken && rawReturnToken !== "undefined" && rawReturnToken !== "null"
    ? rawReturnToken
    : null;
  const loginPath = isAdmin ? "/login" : (returnToken ? `/protocol/${returnToken}` : "/");

  const [form, setForm] = useState({ password: "", confirm: "" });
  const [visible, setVisible] = useState({ password: false, confirm: false });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // After a successful reset, send the user back to their login screen.
  useEffect(() => {
    if (!success) return undefined;
    const timer = setTimeout(() => navigate(loginPath, { replace: true }), REDIRECT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [success, loginPath, navigate]);

  const validateField = (name, values) => {
    if (!values[name]) return t("auth.required");
    if (name === "confirm" && values.password && values.confirm !== values.password) {
      return t("auth.passwordMismatch");
    }
    return "";
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) setFieldErrors((prev) => ({ ...prev, [name]: "" }));
    if (error) setError("");
  };

  const handleBlur = (e) => {
    const { name, value } = e.target;
    // Don't nag about an empty field the user just tabbed through.
    if (!value) return;
    setFieldErrors((prev) => ({ ...prev, [name]: validateField(name, form) }));
  };

  const toggle = (name) => setVisible((prev) => ({ ...prev, [name]: !prev[name] }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = {
      password: validateField("password", form),
      confirm: validateField("confirm", form),
    };
    setFieldErrors(errors);
    if (errors.password || errors.confirm) return;

    setError("");
    setLoading(true);
    try {
      if (isAdmin) {
        await adminResetPasswordApi(token, form.password);
      } else {
        await resetPassword(token, form.password);
      }
      setSuccess(true);
    } catch (err) {
      const msg = err?.message || "";
      setError(/token/i.test(msg) ? t("auth.resetLinkInvalid") : t("auth.resetFailed"));
    } finally {
      setLoading(false);
    }
  };

  const goToLogin = () => navigate(loginPath, { replace: true });

  return (
    <div className="dashboard-page">
      {isAdmin ? (
        <DashboardTopBar />
      ) : (
        <div className="top-bar">
          <span></span>
          <LanguageSwitcher />
        </div>
      )}

      <div className="app-container">
        <div className="auth-page-content compact">
          <div className="auth-subtitle-wrapper">
            <h1 className="auth-main-title">{t("auth.resetPasswordTitle")}</h1>
            {!success && <p className="auth-subtitle">{t("auth.resetPasswordSubtitle")}</p>}
          </div>

          <div className="auth-container-card">
            {success ? (
              <div className="reset-success text-center" role="status">
                <div className="auth-instruction-box">✅ {t("auth.passwordUpdateSuccess")}</div>
                <p className="auth-instruction reset-redirect-note">{t("auth.redirectingToLogin")}</p>
                <button type="button" className="btn-green" onClick={goToLogin}>
                  {t("auth.btnBackToLogin")}
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="auth-flex-form" noValidate>
                <PasswordField
                  id="reset-new-password"
                  name="password"
                  label={t("auth.newPassword")}
                  value={form.password}
                  error={fieldErrors.password}
                  visible={visible.password}
                  onToggle={() => toggle("password")}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  autoFocus
                  t={t}
                />
                <PasswordField
                  id="reset-confirm-password"
                  name="confirm"
                  label={t("auth.confirmPassword")}
                  value={form.confirm}
                  error={fieldErrors.confirm}
                  visible={visible.confirm}
                  onToggle={() => toggle("confirm")}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  t={t}
                />

                {error && <div className="validation-error-msg text-center" role="alert">{error}</div>}

                <button type="submit" disabled={loading} className="btn-green">
                  {loading ? t("auth.processing") : t("auth.btnSetNewPassword")}
                </button>

                <div className="reset-back-row">
                  <button type="button" className="forgot-password-link reset-back-link" onClick={goToLogin}>
                    {t("auth.btnBackToLogin")}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
