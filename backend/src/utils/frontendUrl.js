// src/utils/frontendUrl.js
// Base URL of the deployed admin frontend, used for links in outgoing emails.
// It comes from config rather than the request's Referer/Origin, which the
// caller controls. server.js refuses to boot without it.
export function frontendBaseUrl() {
  const url = process.env.FRONTEND_BASE_URL;
  if (!url) throw new Error("FRONTEND_BASE_URL is not set");
  return url.replace(/\/+$/, "");
}
