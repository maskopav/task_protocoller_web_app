import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useUser } from "../context/UserContext";
import { setupProfileApi } from "../api/auth";
import DashboardTopBar from "../components/DashboardTopBar/DashboardTopBar";
import "./AdminLoginPage.css"; // Reuse login styles

export default function OnboardingPage() {
  const { t } = useTranslation(["admin", "common"]);
  const navigate = useNavigate();
  const { user, login } = useUser();

  const [formData, setFormData] = useState({
    fullName: user?.full_name || "",
    password: "",
    confirmPassword: ""
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (formData.password !== formData.confirmPassword) {
      setError(t("setupProfile.errorMatch"));
      return;
    }

    if (formData.password.length < 8) {
      setError(t("setupProfile.errorLength"));
      return;
    }

    setLoading(true);
    try {
      const res = await setupProfileApi({
        fullName: formData.fullName,
        password: formData.password
      });

      if (res.success) {
        // Update local context with new name and flag 0
        const updatedUser = { ...user, full_name: formData.fullName, must_change_password: 0 };
        // Setup retires the login token (password changed), so store the new one.
        login(updatedUser, res.token);
        navigate("/admin");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dashboard-page">
      <DashboardTopBar />
      
      <div className="auth-page-wrapper">
        <div className="auth-container-card">
          <h1 className="auth-title">{t("setupProfile.title")}</h1>
          <p className="auth-subtitle">{t("setupProfile.subtitle")}</p>

          <form className="auth-inner-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label>{t("setupProfile.labelName")}</label>
              <input
                type="text"
                required
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                placeholder="e.g. Dr. Jane Doe"
              />
            </div>

            <div className="form-group">
              <label>{t("setupProfile.labelPassword")}</label>
              <input
                type="password"
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="••••••••"
              />
            </div>

            <div className="form-group">
              <label>{t("setupProfile.labelConfirm")}</label>
              <input
                type="password"
                required
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                placeholder="••••••••"
              />
            </div>

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? t("common:loading") : t("setupProfile.btnSubmit")}
            </button>
          </form>
        </div>

        {error && (
          <div className="auth-error-box fade-in">
            <span className="error-icon">⚠️</span>
            <span className="error-text">{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}