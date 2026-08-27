import i18n from "../i18n";
const API_BASE = import.meta.env.VITE_API_BASE;


  export async function loginAdmin(data) {
    const res = await fetch(`${API_BASE}/auth/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Login failed");
    return json; // returns { success: true, user: { ... } }
  }

export async function adminForgotPasswordApi(email) {
  const res = await fetch(`${API_BASE}/auth/admin/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, lang: i18n.language }),
  });
  if (!res.ok) throw new Error("Request failed");
  return res.json();
}

export async function adminResetPasswordApi(token, password) {
  const res = await fetch(`${API_BASE}/auth/admin/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Reset failed");
  return json;
}

  export async function setupProfileApi(payload) {
    const res = await fetch(`${API_BASE}/auth/setup-profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || "Failed to update profile");
    }
    return res.json();
  }
 