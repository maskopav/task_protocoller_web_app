// src/components/Common/AuthForm.jsx
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { validate } from "../../utils/validation";
import "./AuthForm.css";

export default function AuthForm({
  title,
  subtitle,
  onLogin,
  onSignup,
  onForgot,
  signupFields = [],
  initialMode = "login",
  initialData = {}
}) {
  const { t } = useTranslation(["common"]);
  const [mode, setMode] = useState(initialMode);
  const [isRegistered, setIsRegistered] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [successMsg, setSuccessMsg] = useState("");
  const [formData, setFormData] = useState(initialData);
  const [showPassword, setShowPassword] = useState(false);

  // Helper to translate error keys returned by the validation utility
  const getErrorMessage = (errorKey) => {
    if (!errorKey) return "";
    return t(`auth.${errorKey}`); 
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
    
    // For select fields, validate immediately on change
    if (e.target.tagName === "SELECT") {
        const fieldDef = signupFields.find(f => f.name === name);
        const errorKey = validate.auth.field(name, value, fieldDef?.required);
        setFieldErrors(prev => ({ ...prev, [name]: getErrorMessage(errorKey) }));
    } else if (fieldErrors[name]) {
      // For text inputs, just clear the error while typing
        setFieldErrors({ ...fieldErrors, [name]: "" });
      }
  };

  const handleBlur = (e) => {
    const { name, value } = e.target;
    
    // Determine if this specific field is required
    let required = name === "email" || name === "password"; // email/password are always required
    if (mode === "signup") {
      const fieldDef = signupFields.find(f => f.name === name);
      if (fieldDef) required = fieldDef.required;
    }
  
    const errorMsg = validate.auth.field(name, value, required);
    setFieldErrors(prev => ({ ...prev, [name]: getErrorMessage(errorMsg) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    let validation;
    if (mode === "login") {
      validation = validate.auth.login(formData);
    } else if (mode === "signup") {
      const errors = {};
      signupFields.forEach(f => {
        const key = validate.auth.field(f.name, formData[f.name], f.required);
        if (key) errors[f.name] = getErrorMessage(key);
      });
      validation = { isValid: Object.keys(errors).length === 0, errors };
    } else {
      const key = validate.auth.field("email", formData.email, true);
      validation = { isValid: !key, errors: key ? { email: getErrorMessage(key) } : {} };
    }

    if (!validation.isValid) {
      // Map validation error keys to translated strings
      const translatedErrors = {};
      Object.keys(validation.errors).forEach(key => {
        translatedErrors[key] = getErrorMessage(validation.errors[key]);
      });
      setFieldErrors(translatedErrors);
      return;
    }

    setLoading(true);
    try {
      if (mode === "forgot") {
        await onForgot(formData.email);
        setSuccessMsg(t("auth.resetEmailSent"));
      } else if (mode === "signup") {
        await onSignup(formData);
        setIsRegistered(true);
      } else {
        await onLogin(formData);
      }
    } catch (err) {
      setError(err.message || t("auth.errorGeneric"));
    } finally {
      setLoading(false);
    }
  };

  // Success View for Registration
  if (isRegistered) {
    return (
      <div className="auth-page-content compact">
        <div className="auth-container-card text-center">
          <h2 className="auth-main-title">{t("auth.signupSuccessTitle")}</h2>
          <div className="auth-success-info">
            <p>{t("auth.signupSuccessDetail")}</p>
            <p className="auth-tip"><strong>{t("auth.spamNote")}</strong></p>
            <div className="auth-instruction-box">
              {t("auth.smartphoneNote")}
            </div>
          </div>
          <button className="btn-primary" onClick={() => { setIsRegistered(false); setMode("login"); }}>
            {t("auth.btnBackToLogin")}
          </button>
        </div>
      </div>
    );
  }

  return (
      <div className="app-container">
        <div className="auth-page-content compact"> 
          
          <div className="auth-subtitle-wrapper">
              <h1 className="auth-main-title">{title}</h1>
              <p className="auth-subtitle">{subtitle}</p>
          </div>
          
          <div className="auth-container-card"> 
            {onSignup && (
              <div className="auth-form-tabs">
                <button 
                  type="button"
                  className={`tab-btn ${mode === "signup" ? "active" : "faded"}`}
                  onClick={() => { setMode("signup"); setError(""); setFieldErrors({}); setSuccessMsg(""); }}
                >
                  {t("auth.tabSignup")}
                </button>
                <button 
                  type="button"
                  className={`tab-btn ${mode === "login" ? "active" : "faded"}`}
                  onClick={() => { setMode("login"); setError(""); setFieldErrors({}); setSuccessMsg(""); }}
                >
                  {t("auth.tabLogin")}
                </button>
              </div>
            )}

            <form onSubmit={handleSubmit} className="auth-flex-form" noValidate>
              <div className="form-field">
                <label className="form-label">{t("auth.email")}</label>
                <input 
                  required type="email" name="email" className={`participant-input ${fieldErrors.email ? 'input-error' : ''}`}
                  placeholder="e.g. john.doe@example.com"
                  value={formData.email || ""} onChange={handleChange} onBlur={handleBlur}
                />
                {fieldErrors.email && <span className="field-error-text">{fieldErrors.email}</span>}
              </div>

              {mode === "signup" && (
                <div className="signup-grid">
                  {signupFields.map(field => (
                    <div key={field.name} className={`form-field ${field.gridSpan ? 'span-half' : ''}`}>
                    <label className="form-label">{field.label}</label>
                    
                    {field.type === "select" ? (
                        <>
                        <select 
                            name={field.name} 
                            className={`participant-input ${fieldErrors[field.name] ? 'input-error' : ''}`} 
                            value={formData[field.name]} 
                            onChange={handleChange}
                            onBlur={handleBlur}
                        >
                            {field.options.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                        {fieldErrors[field.name] && (
                            <span className="field-error-text">{fieldErrors[field.name]}</span>
                        )}
                        </>
                    ) : (
                        <>
                        <input 
                            required={field.required} type={field.type} name={field.name} 
                            placeholder={field.placeholder}
                            className={`participant-input ${fieldErrors[field.name] ? 'input-error' : ''}`}
                            value={formData[field.name] || ""} onChange={handleChange} onBlur={handleBlur}
                        />
                        {fieldErrors[field.name] && <span className="field-error-text">{fieldErrors[field.name]}</span>}
                        </>
                    )}
                    </div>
                ))}
                </div>
              )}

              {mode === "login" && (
                <div className="form-field">
                  <label className="form-label">{t("auth.password")}</label>
                  <div className="password-wrapper">
                  <input 
                    required 
                    type={showPassword ? "text" : "password"} // Toggle type
                    name="password" 
                    className="participant-input" 
                    value={formData.password || ""} 
                    onChange={handleChange} 
                  />
                  <button 
                    type="button" 
                    className="password-toggle" 
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? t("auth.hide") : t("auth.show")}
                  </button>
                </div>
                {onForgot && (
                    <div style={{textAlign: "right", marginTop: "0.25rem"}}>
                      <span className="forgot-password-link" onClick={() => setMode("forgot")}>
                        {t("auth.forgotPasswordLink")}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {mode === "forgot" && <p className="auth-instruction">{t("auth.forgotPasswordInstruction")}</p>}

              {error && <div className="validation-error-msg text-center">{error}</div>}
              {successMsg && <div className="text-center validation-success-msg" style={{color: "green"}}>{successMsg}</div>}

              <button type="submit" disabled={loading} className="btn-green">
                {loading ? t("auth.processing") : (mode === "signup" ? t("auth.btnSignup") : mode === "login" ? t("auth.btnLogin") : t("auth.btnSendResetLink"))}
              </button>

              {mode === "forgot" && (
                <button type="button" className="btn-secondary" onClick={() => setMode("login")}>
                   {t("auth.btnBackToLogin")}
                </button>
              )}
            </form>
          </div>
        </div>
      </div>
  );
}