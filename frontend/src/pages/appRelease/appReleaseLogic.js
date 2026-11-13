// src/pages/appRelease/appReleaseLogic.js — link building for the App release page.

const trimSlashes = (s) => String(s).replace(/\/+$/, "");

/**
 * The base the install links hang off. PUBLIC_BASE_URL (the clinic-facing
 * origin, e.g. https://malenia.feld.cvut.cz/koubic) when the server has it;
 * otherwise the directory this app is served from (HashRouter: the page path
 * is the app root, so a path prefix like /koubic/ is kept). `fallback` tells
 * the page to warn that clinics may not reach it.
 */
export function linkBase(publicBaseUrl, href = window.location.href) {
  if (publicBaseUrl) return { base: trimSlashes(publicBaseUrl), fallback: false };
  const url = new URL(href.split("#")[0]);
  url.search = "";
  // The app root is a directory. "/koubic" (no trailing slash) is that
  // directory too; only a last segment that looks like a file (index.html) is dropped.
  const p = url.pathname;
  if (!p.endsWith("/")) {
    const cut = p.lastIndexOf("/") + 1;
    url.pathname = p.slice(cut).includes(".") ? p.slice(0, cut) : `${p}/`;
  }
  return { base: trimSlashes(url.href), fallback: true };
}

/** base + "/" + a server-relative path such as "api/version/download/latest/<name>". */
export const joinLink = (base, relPath) => `${trimSlashes(base)}/${String(relPath).replace(/^\/+/, "")}`;
