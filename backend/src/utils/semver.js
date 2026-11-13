// src/utils/semver.js
//
// Plain x.y.z versions, compared as integer tuples (1.0.10 > 1.0.9). No
// pre-release or build suffixes: anything else does not parse. Shared by the
// release store (which release is latest) and the site-config version gate
// (which desktop clients get relative asset paths), so both use one rule.
export const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

// [major, minor, patch] of a strict x.y.z string, else null.
export const semverKey = (v) => {
  const m = typeof v === "string" ? SEMVER_RE.exec(v) : null;
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};

// Integer tuple order. <0, 0 or >0 like a sort comparator.
export const compareKeys = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
