// frontend/src/pages/AdminLoginPage.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation, Trans } from "react-i18next";
import AuthForm from "../components/AuthForm/AuthForm";
import { loginAdmin, adminForgotPasswordApi } from "../api/auth";
import DashboardTopBar from "../components/DashboardTopBar/DashboardTopBar";
import { useUser } from "../context/UserContext";
import "./AdminLoginPage.css";

export default function AdminLoginPage() {
  const { t } = useTranslation(["admin", "common"]);
  const navigate = useNavigate();
  const { login, logout } = useUser();
  const [status, setStatus] = useState({ type: "", message: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Ensure clean state on mount
    logout(); 
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAdminLogin = async (formData) => {
    setStatus({ type: "", message: "" });
    setIsSubmitting(true);

    try {
      const res = await loginAdmin(formData);
      
      if (res.success && res.user) {
        login(res.user); 
        if (res.user.must_change_password) {
          navigate("/setup-account");
        } else {
          navigate("/admin");
        }
      } else {
        // Handle cases where res.success is false but no exception was thrown
        throw new Error("credentials"); 
      }
    } catch (err) {
      console.error("Login submission error:", err);
      
      // Map backend error messages to translation keys
      let msg = t("adminLogin.errorGeneric"); // Default error

      if (err.message.includes("deactivated")) {
        msg = t("adminLogin.errorDeactivated"); // Specific message for inactive users
      } else if (err.message.includes("credentials")) {
        msg = t("adminLogin.errorGeneric");
      } else {
        msg = t("adminLogin.errorConnection");
      }
      
      setStatus({ type: "error", message: msg });
      throw new Error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotSubmit = async (email) => {
    setStatus({ type: "", message: "" });
    try {
      await adminForgotPasswordApi(email);
      // Use "success" type so the box turns green
      setStatus({ type: "success", message: t("adminLogin.resetEmailSent") }); 
    } catch (err) {
      setStatus({ type: "error", message: t("adminLogin.errorConnection") });
    }
  };

  return (
    <div className="dashboard-page">
      <DashboardTopBar />
      
      <div className="auth-page-wrapper">
        <AuthForm
          title={t("adminLogin.title")}
          subtitle={
            <Trans
              i18nKey="adminLogin.subtitle"
              ns="admin"
              components={{ strong: <strong /> }}
            />
          }
          onLogin={handleAdminLogin}
          isLoading={isSubmitting}
          onForgot={handleForgotSubmit} 
        />

        {/* Dynamic Status Feedback (Success or Error) */}
        {status.message && (
          <div className={`auth-status-box ${status.type === "success" ? "status-success" : "status-error"} fade-in`}>
            <span className="status-icon">{status.type === "success" ? "✅" : "⚠️"}</span>
            <span className="status-text">{status.message}</span>
          </div>
        )}
      </div>
    </div>
  );
}