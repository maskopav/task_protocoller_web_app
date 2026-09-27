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
