// frontend/src/pages/OnboardingPage.jsx — first sign-in: set the name and a permanent password (section 6.9).
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useUser } from "../context/UserContext";
import { setupProfileApi } from "../api/auth";
import AuthCard from "../components/AuthForm/AuthCard";
import { Button, TextField } from "../components/ui";

export default function OnboardingPage() {
  const { t } = useTranslation(["admin", "common"]);
  const navigate = useNavigate();
  const { user, login } = useUser();

  const [formData, setFormData] = useState({ fullName: user?.full_name || "", password: "", confirmPassword: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const set = (key) => (e) => setFormData((d) => ({ ...d, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (formData.password !== formData.confirmPassword) { setError(t("setupProfile.errorMatch")); return; }
    if (formData.password.length < 8) { setError(t("setupProfile.errorLength")); return; }

    setLoading(true);
    try {
      const res = await setupProfileApi({ fullName: formData.fullName, password: formData.password });
      if (res.success) {
        // Setup retires the login token (password changed), so store the new one.
        login({ ...user, full_name: formData.fullName, must_change_password: 0 }, res.token);
        navigate("/recordings");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      title={t("setupProfile.title")}
      lead={t("setupProfile.subtitle")}
      status={error ? { type: "error", message: error } : null}
      data-testid="setup-card"
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <TextField label={t("setupProfile.labelName")} required autoComplete="name" value={formData.fullName} onChange={set("fullName")} />
        <TextField label={t("setupProfile.labelPassword")} type="password" required autoComplete="new-password" value={formData.password} onChange={set("password")} />
        <TextField label={t("setupProfile.labelConfirm")} type="password" required autoComplete="new-password" value={formData.confirmPassword} onChange={set("confirmPassword")} />
        <Button variant="primary" type="submit" disabled={loading}>
          {loading ? t("common:loading") : t("setupProfile.btnSubmit")}
        </Button>
      </form>
    </AuthCard>
  );
}
