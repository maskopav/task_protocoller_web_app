// backend/src/routes/version.js
//
// Public desktop-app auto-update API (no auth, like /site-config/:token):
//   GET /version/latest?platform=<p>
//   GET /version/download/:version/:name   (HEAD and Range supported)
// nginx strips /api, so these sit at the backend root.
import express from "express";
import fs from "fs";
import path from "path";
import { pipeline } from "stream";
import { createReleaseStore, PLATFORM_RE, SEMVER_RE } from "../releases/releaseStore.js";
import { logToFile } from "../utils/logger.js";

const CONTENT_TYPES = { ".zip": "application/zip", ".gz": "application/gzip", ".json": "application/json", ".sha256": "text/plain" };

const logStreamError = (err) => {
  if (err && err.code !== "ERR_STREAM_PREMATURE_CLOSE") {
    logToFile("ERROR", "Release download stream failed", { code: err.code ?? err.name ?? "Error" });
  }
};

// Parses a single "bytes=a-b" range against `size`. Same semantics as the clip
// route in downloadController (which is zip-entry based, so not shared).
// Returns null (no/ignored range), "unsatisfiable", or { start, end }.
function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header ?? "").trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  if (m[1] === "") {
    const n = Number(m[2]);
    if (n === 0 || size === 0) return "unsatisfiable";
    return { start: Math.max(size - n, 0), end: size - 1 };
  }
  const start = Number(m[1]);
  const end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  if (start >= size || start > end) return "unsatisfiable";
  return { start, end };
}

export function createVersionRouter({ releasesPath }) {
  const router = express.Router();
  const store = createReleaseStore(releasesPath);

  router.get("/latest", (req, res) => {
    res.set("Cache-Control", "no-store");
    const release = store.latestRelease();
    if (!release) return res.status(404).json({ error: "no release published" });
    const platform = typeof req.query.platform === "string" ? req.query.platform : undefined;
    if (platform !== undefined && platform !== "" && !PLATFORM_RE.test(platform)) {
      return res.status(400).json({ error: "invalid platform" });
    }
    // The component URLs are deliberately RELATIVE ("download/<v>/<file>"). The
    // updater resolves them against its endpoint URL (".../api/version/latest"),
    // which works for every way this server is reached (direct :10001/api, or
    // behind the outer proxy that strips a path prefix). The backend cannot
    // know a correct absolute URL.
    res.json({ release, components: store.componentsFor(release, platform) });
  });

  router.get("/download/:version/:name", (req, res) => {
    const { version, name } = req.params;
    const file = SEMVER_RE.test(version) ? store.resolveArtifactPath(version, name) : null;
    if (!file) return res.status(404).json({ error: "no such release artifact" });

    let size;
    try { size = fs.statSync(file).size; } catch { return res.status(404).json({ error: "no such release artifact" }); }

    const range = parseRange(req.headers.range, size);
    if (range === "unsatisfiable") return res.status(416).set("Content-Range", `bytes */${size}`).end();
    const start = range?.start ?? 0;
    const end = range?.end ?? size - 1;

    const ext = name.endsWith(".tar.gz") ? ".gz" : path.extname(name).toLowerCase();
    res.status(range ? 206 : 200).set({
      "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Accept-Ranges": "bytes",
      "Content-Length": String(size === 0 ? 0 : end - start + 1),
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
    });
    if (req.method === "HEAD" || size === 0) return res.end();
    pipeline(fs.createReadStream(file, { start, end }), res, logStreamError);
  });

  return router;
}
