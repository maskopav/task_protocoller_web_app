// utils/apiError.js — turns an ApiError (api/apiClient.js) into text for a toast
// or an inline message. The backend sends snake_case codes; admin:apiErrors.<code>
// holds the wording, and an unknown code falls back to the code itself.
export function apiErrorMessage(err, t) {
  const code = err?.code ?? err?.message;
  if (!code) return t("apiErrors.generic", { ns: "admin" });
  return t(`apiErrors.${code}`, { ns: "admin", defaultValue: err?.message || code });
}
