// backend/src/controllers/authController.js
import bcrypt from "bcrypt";
import crypto from "crypto";
import { executeQuery } from "../db/queryHelper.js";

import { sendPasswordResetEmail } from "../utils/emailService.js";
import { logToFile } from "../utils/logger.js";
import { signAdminToken } from "../utils/jwt.js";
import { passwordError } from "../utils/fieldValidation.js";
import { frontendBaseUrl } from "../utils/frontendUrl.js";

const SALT_ROUNDS = 10;

// Only the emailed token grants a reset, so the DB keeps just its digest: a
// leaked users table (backup, SQL console) must not hand out live reset links.
const hashResetToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

// token_version goes into the JWT, not the client's cached user object.
const publicUser = ({ token_version, ...user }) => user;

// bcrypt of a random, discarded value. Unknown emails are compared against it
// so they take as long as known ones — otherwise response time reveals which
// emails have accounts.
const DUMMY_HASH = "$2b$10$sD9wIOGPZxXQcS2fJzNnmOkGz1r5vxUBSuYo.UU2CnOyjjUKXbgI6";


// POST /api/auth/admin/login
export const adminLogin = async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    // 1. Find user - Include is_active in the SELECT statement
    const rows = await executeQuery(
      `SELECT u.id, u.email, u.password_hash, u.full_name, u.role_id, r.name as role, u.is_active, u.must_change_password, u.can_create_projects, u.can_create_sites, u.token_version
      FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.email = ?`,
      [email]
    );

    const user = rows[0];

    // 2. Verify the password first, and always run bcrypt, so neither the
    // response nor its timing tells an unknown email from a wrong password.
    const match = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !match) {
      return res.status(401).json({ error: "Invalid admin credentials" });
    }

    // 3. Deactivation is only disclosed to someone who knows the password.
    if (user.is_active === 0) {
      return res.status(403).json({ error: "Your account is deactivated. Please contact the Master admin." });
    }

    // 4. Return user data + session token
    const userPayload = {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      role_id: user.role_id,
      must_change_password: user.must_change_password,
      token_version: user.token_version
    };

    res.json({
      success: true,
      // The flag rides on the response but not on the token: createProject
      // re-reads it from the DB, so a revoked right takes effect at once even
      // though the cached client copy lags until the next login.
      user: {
        ...publicUser(userPayload),
        can_create_projects: Number(user.can_create_projects) === 1,
        can_create_sites: Number(user.can_create_sites) === 1
      },
      token: signAdminToken(userPayload)
    });


  } catch (err) {
    logToFile("ERROR", "Admin login failed", { email, error: err.message, stack: err.stack });
    res.status(500).json({ error: "Login failed" });
  }
};

// POST /api/auth/admin/forgot-password
export const adminForgotPassword = async (req, res) => {
  const { email, lang } = req.body ?? {};
  if (typeof email !== "string") {
    return res.status(400).json({ error: "Email is required" });
  }
  try {
    const rows = await executeQuery(`SELECT id FROM users WHERE email = ?`, [email]);
    if (rows.length === 0) {
      // Prevent email scraping by returning success
      return res.json({ success: true, message: "If account exists, email sent." });
    }

    const token = crypto.randomBytes(32).toString('hex');

    await executeQuery(
      `UPDATE users SET reset_password_token = ?, reset_password_expires = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 HOUR) WHERE id = ?`,
      [hashResetToken(token), rows[0].id]
    );

    // The link base is server config, never Referer/Origin: those are
    // attacker-controlled, and a forged one would mail the victim a genuine
    // reset token pointing at the attacker's host.
    const resetLink = `${frontendBaseUrl()}/#/admin/reset-password/${token}`;
    
    // Reuse existing email service helper (pass null for protocolToken)
    await sendPasswordResetEmail(email, resetLink, null, lang);

    res.json({ success: true });
  } catch (err) {
    logToFile("ERROR", "Admin forgot password request failed", { email, error: err.message, stack: err.stack });
    res.status(500).json({ error: "Request failed" });
  }
};

// POST /api/auth/admin/reset-password
export const adminResetPassword = async (req, res) => {
  const { token, password } = req.body ?? {};
  if (typeof token !== "string" || token === "") {
    return res.status(400).json({ error: "Invalid or expired token" });
  }
  const pwError = passwordError(password);
  if (pwError) return res.status(400).json({ error: pwError });
  try {
    const rows = await executeQuery(
      `SELECT id FROM users WHERE reset_password_token = ? AND reset_password_expires > UTC_TIMESTAMP()`,
      [hashResetToken(token)]
    );

    if (rows.length === 0) {
      return res.status(400).json({ error: "Invalid or expired token" });
    }

    const hash = await bcrypt.hash(password, 12);
    await executeQuery(
      // Bumping token_version logs out every existing session — the point of a
      // reset is often that someone else has the old password.
      `UPDATE users SET password_hash = ?, reset_password_token = NULL, reset_password_expires = NULL,
         token_version = token_version + 1 WHERE id = ?`,
      [hash, rows[0].id]
    );

    res.json({ success: true });
  } catch (err) {
    logToFile("ERROR", "Admin reset password failed", { error: err.message, stack: err.stack });
    res.status(500).json({ error: "Reset failed" });
  }
};

// POST /api/auth/setup-profile — behind requireAuth (see routes/auth.js).
// The account is the caller's own, taken from the verified token: this used to
// be a public route that trusted `userId` from the body, so anyone could set
// any account's password. It is also only usable while the account still has
// its emailed temporary password; changing a password later goes through reset.
export const setupAdminProfile = async (req, res) => {
  const { fullName, password } = req.body ?? {};
  const userId = req.admin?.id;

  if (userId == null) return res.status(401).json({ error: "Unauthorized" });
  if (fullName != null && typeof fullName !== "string") {
    return res.status(400).json({ error: "fullName must be a string" });
  }
  const pwError = passwordError(password);
  if (pwError) return res.status(400).json({ error: pwError });

  try {
    const hashedPassword = await bcrypt.hash(password, 12);

    const result = await executeQuery(
      `UPDATE users 
       SET full_name = IFNULL(?, full_name), 
           password_hash = ?, 
           must_change_password = 0, 
           token_version = token_version + 1,
           updated_at = UTC_TIMESTAMP() 
       WHERE id = ? AND must_change_password = 1`,
      [fullName ?? null, hashedPassword, userId]
    );
    if (result.affectedRows === 0) {
      return res.status(409).json({ error: "Profile has already been set up" });
    }

    // The bump above retired the caller's own token along with any session
    // opened with the emailed temporary password, so hand back a fresh one.
    const [user] = await executeQuery(
      `SELECT u.id, u.email, u.role_id, r.name AS role, u.token_version
       FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = ?`,
      [userId]
    );

    res.json({ success: true, message: "Profile setup complete", token: signAdminToken(user) });
  } catch (err) {
    logToFile("ERROR", "Admin profile setup failed", { userId, error: err.message, stack: err.stack });
    res.status(500).json({ error: "Failed to update profile" });
  }
};
