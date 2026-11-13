// src/routes/appRelease.js
//
// GET /app-release (behind requireAuth): the desktop release this server
// serves, for the admin "App release" page. Masters and users with
// can_see_technical only; the flag is read fresh from the DB on every request,
// so revoking it takes effect at once (the client's menu lags until re-login).
//
// Response:
//   { release: null | { version, publishedAt, bundles: [{ name, size, sha256,
//       latestPath: "api/version/download/latest/<name>",
//       versionedPath: "api/version/download/<v>/<name>" }] },
//     publicBaseUrl: PUBLIC_BASE_URL | null }
// The paths are relative to the clinic-facing base (PUBLIC_BASE_URL, e.g.
// https://malenia.feld.cvut.cz/koubic); the page joins them with "/". The
// backend cannot know that base from the request (the outer proxy strips its
// path prefix), hence the env.
import express from "express";
import { createReleaseStore } from "../releases/releaseStore.js";
import { canSeeTechnical } from "../utils/accessScope.js";
import { logToFile } from "../utils/logger.js";

export function createAppReleaseRouter({ releasesPath }) {
  const router = express.Router();
  const store = createReleaseStore(releasesPath);

  router.get("/", async (req, res) => {
    try {
      const allowed = req.admin?.role === "master" || await canSeeTechnical(req.admin?.id);
      if (!allowed) return res.status(403).json({ error: "Forbidden" });

      const latest = store.latestInstallBundles();
      const release = latest && {
        version: latest.version,
        publishedAt: latest.publishedAt,
        bundles: latest.bundles.map((b) => ({
          ...b,
          latestPath: `api/version/download/latest/${encodeURIComponent(b.name)}`,
          versionedPath: `api/version/download/${encodeURIComponent(latest.version)}/${encodeURIComponent(b.name)}`,
        })),
      };
      res.set("Cache-Control", "no-store");
      res.json({ release, publicBaseUrl: process.env.PUBLIC_BASE_URL || null });
    } catch (err) {
      logToFile("ERROR", "App release lookup failed", { error: err.message, stack: err.stack });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}

export default createAppReleaseRouter;
