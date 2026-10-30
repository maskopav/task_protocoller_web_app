// F-090: the API base as an absolute URL for the "Connect a computer" panel.
// VITE_API_BASE may be relative ("./api"); the desktop app needs the full address.

/** Absolute URL of `base`, resolved against `href`; no hash, query or trailing slash. "" for an empty base. */
export function absoluteApiAddress(base, href = typeof window !== "undefined" ? window.location.href : "") {
  const b = String(base ?? "").trim();
  if (!b) return "";
  try {
    const u = new URL(b, href);
    u.hash = "";
    u.search = "";
    return u.href.replace(/\/+$/, "");
  } catch {
    return b;
  }
}
