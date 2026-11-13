// backend/src/releases/releaseStore.js
//
// Read-only view of the published desktop-app releases under a root directory:
//   <root>/<x.y.z>/{manifest-<platform>.json, <artifacts>, install-*.{zip,tar.gz}, <file>.sha256}
// Every call hits the filesystem, so a publish (mv of the finished directory)
// needs no restart. Directories that are not plain x.y.z (e.g. an in-progress
// ".incoming-1.0.1") are invisible. A missing root means "no release".
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { logToFile } from "../utils/logger.js";
import { SEMVER_RE, semverKey, compareKeys } from "../utils/semver.js";

export { SEMVER_RE, semverKey, compareKeys };

export const PLATFORM_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const MANIFEST_RE = /^manifest-.+\.json$/;
export const INSTALL_RE = /^install-.+\.(zip|tar\.gz)$/;

// Where the releases live unless RELEASES_PATH says otherwise. Shared by the
// public version API, the admin App release page and the welcome email.
export const releasesPath = () => process.env.RELEASES_PATH || "/srv/task-protocoller/releases";

const isPlainName = (n) =>
  typeof n === "string" && n !== "" && n !== "." && n !== ".." && !/[\\/\0]/.test(n);

const readDir = (dir) => {
  try { return fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
};

const readJson = (file) => {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
};

const declaredComponents = (file) => {
  const components = readJson(file)?.components;
  return Array.isArray(components) ? components.filter((c) => c && typeof c === "object") : [];
};

export function createReleaseStore(root) {
  const versionDir = (version) => path.join(root, version);

  // Highest x.y.z by integer tuple (1.0.10 > 1.0.9), or null.
  function latestRelease() {
    let best = null;
    for (const e of readDir(root)) {
      if (!e.isDirectory()) continue;
      const key = semverKey(e.name);
      if (key && (!best || compareKeys(key, best.key) > 0)) best = { name: e.name, key };
    }
    return best?.name ?? null;
  }

  // The names that may be downloaded: manifests, their declared artifacts,
  // install bundles, plus .sha256 sidecars of any of those that exist.
  // Membership in this set is the traversal guard.
  function allowedArtifacts(version) {
    const names = new Set();
    if (!SEMVER_RE.test(version)) return names;
    const dir = versionDir(version);
    for (const e of readDir(dir)) {
      if (!e.isFile()) continue;
      if (MANIFEST_RE.test(e.name)) {
        names.add(e.name);
        for (const c of declaredComponents(path.join(dir, e.name))) {
          // Only plain file names: a manifest must not be able to widen the guard
          // to "../x" or "sub/dir/x".
          if (isPlainName(c.artifact)) names.add(c.artifact);
        }
      } else if (INSTALL_RE.test(e.name)) {
        names.add(e.name);
      }
    }
    for (const n of [...names]) {
      if (fs.existsSync(path.join(dir, `${n}.sha256`))) names.add(`${n}.sha256`);
    }
    return names;
  }

  // Absolute path of an allowlisted, existing regular file, else null.
  function resolveArtifactPath(version, name) {
    if (!SEMVER_RE.test(version) || typeof name !== "string") return null;
    if (!allowedArtifacts(version).has(name)) return null;
    const file = path.join(versionDir(version), name);
    try { return fs.statSync(file).isFile() ? file : null; } catch { return null; }
  }

  function sha256OfFile(file) {
    const hash = crypto.createHash("sha256");
    const fd = fs.openSync(file, "r");
    try {
      const buf = Buffer.allocUnsafe(1024 * 1024);
      let n;
      while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) hash.update(buf.subarray(0, n));
    } finally { fs.closeSync(fd); }
    return hash.digest("hex");
  }

  // Sidecar first token (sha256sum format), else hash the file.
  function checksumOf(version, name) {
    const file = path.join(versionDir(version), name);
    try {
      const token = fs.readFileSync(`${file}.sha256`, "utf8").trim().split(/\s+/)[0];
      if (token) return token.toLowerCase();
    } catch { /* no sidecar: hash below */ }
    try { return sha256OfFile(file); } catch { return null; }
  }

  // Components of `version` for `platform`, with the checksum the updater
  // verifies. [] for a missing/unknown platform or a missing/bad manifest. An
  // entry whose artifact or checksum is missing is dropped (and logged).
  // `url` is relative to the endpoint URL; see routes/version.js.
  function componentsFor(version, platform) {
    if (!platform || !PLATFORM_RE.test(platform)) return [];
    const out = [];
    for (const c of declaredComponents(path.join(versionDir(version), `manifest-${platform}.json`))) {
      const artifact = typeof c.artifact === "string" ? c.artifact : null;
      const file = artifact && resolveArtifactPath(version, artifact);
      const checksum = file ? checksumOf(version, artifact) : null;
      if (!checksum) {
        logToFile("WARN", "Release component dropped: artifact or checksum missing", { details: `${version} ${String(c.id)}` });
        continue;
      }
      out.push({
        id: c.id,
        target: c.target,
        url: `download/${encodeURIComponent(version)}/${encodeURIComponent(artifact)}`,
        checksum,
      });
    }
    return out;
  }

  // Install bundles (install-*.zip / .tar.gz) that exist as regular files in `version`, by name.
  function installNames(version) {
    return readDir(versionDir(version))
      .filter((e) => e.isFile() && INSTALL_RE.test(e.name))
      .map((e) => e.name)
      .sort();
  }

  // The latest release with its first-install bundles, for the admin App
  // release page: { version, publishedAt, bundles: [{ name, size, sha256 }] },
  // or null when nothing is published. publishedAt is the release folder's
  // mtime: roughly when the last file was uploaded, minutes before release.sh's
  // final mv makes it live (a rename keeps the folder's own mtime). sha256 comes
  // from the .sha256 sidecar when present, else the file is hashed.
  function latestInstallBundles() {
    const version = latestRelease();
    if (!version) return null;
    let publishedAt = null;
    try { publishedAt = fs.statSync(versionDir(version)).mtime.toISOString(); } catch { /* raced away */ }
    const bundles = [];
    for (const name of installNames(version)) {
      let size;
      try { size = fs.statSync(path.join(versionDir(version), name)).size; } catch { continue; }
      bundles.push({ name, size, sha256: checksumOf(version, name) });
    }
    return { version, publishedAt, bundles };
  }

  // The latest release's install bundle for one platform family, matched by
  // name prefix: latestInstallBundle("windows") finds install-windows*.
  // { version, name } (no hashing), or null.
  function latestInstallBundle(platformPrefix) {
    const version = latestRelease();
    if (!version || typeof platformPrefix !== "string" || !platformPrefix) return null;
    const name = installNames(version).find((n) => n.startsWith(`install-${platformPrefix}`));
    return name ? { version, name } : null;
  }

  return { latestRelease, componentsFor, allowedArtifacts, resolveArtifactPath, latestInstallBundles, latestInstallBundle };
}
