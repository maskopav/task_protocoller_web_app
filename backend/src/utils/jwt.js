// backend/src/utils/jwt.js
import jwt from "jsonwebtoken";

export function signAdminToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      role_id: user.role_id,
      // Checked against users.token_version by requireAuth; see there.
      tv: Number(user.token_version ?? 0),
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "8h" }
  );
}

export function verifyAdminToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
}

// Download tickets: what <audio>/<video> elements and plain browser downloads
// use instead of the Authorization header they cannot send. A ticket is a
// separate, short-lived token that requireAuth refuses (purpose claim), so a
// ticket leaking into a URL or an access log can, for 5 minutes, only fetch
// what that admin may already download. It cannot reach any other route.
export const DOWNLOAD_PURPOSE = "download";

export function signDownloadTicket(admin) {
  return jwt.sign(
    { id: admin.id, tv: Number(admin.tv ?? 0), purpose: DOWNLOAD_PURPOSE },
    process.env.JWT_SECRET,
    { expiresIn: "5m" }
  );
}
