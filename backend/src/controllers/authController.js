// backend/src/controllers/authController.js
import bcrypt from "bcrypt";
import crypto from "crypto";
import { executeQuery } from "../db/queryHelper.js";

import { sendPasswordResetEmail } from "../utils/emailService.js";
import { logToFile } from "../utils/logger.js";
import { signAdminToken } from "../utils/jwt.js";

const SALT_ROUNDS = 10;


// POST /api/auth/admin/login
export const adminLogin = async (req, res) => {
  const { email, password } = req.body;

  try {
    // 1. Find user - Include is_active in the SELECT statement
    const rows = await executeQuery(
      `SELECT u.id, u.email, u.password_hash, u.full_name, u.role_id, r.name as role, u.is_active, u.must_change_password 
      FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.email = ?`,
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: "Invalid admin credentials" });
    }

    const user = rows[0];

    // 2. CHECK IF ACTIVE (NEW)
    if (user.is_active === 0) {
      return res.status(403).json({ error: "Your account is deactivated. Please contact the Master admin." });
    }

    // 3. Verify Password
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: "Invalid admin credentials" });
    }

    // 4. Return user data + session token
    const userPayload = {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      role_id: user.role_id,
      must_change_password: user.must_change_password
    };

    res.json({
      success: true,
      user: userPayload,
      token: signAdminToken(userPayload)
    });

  } catch (err) {
    logToFile("ERROR", "Admin login failed", { email, error: err.message, stack: err.stack });
    res.status(500).json({ error: "Login failed" });
  }
};

// POST /api/auth/admin/forgot-password
export const adminForgotPassword = async (req, res) => {
  const { email, lang } = req.body;
  try {
    const rows = await executeQuery(`SELECT id FROM users WHERE email = ?`, [email]);
    if (rows.length === 0) {
      // Prevent email scraping by returning success
      return res.json({ success: true, message: "If account exists, email sent." });
    }

    const token = crypto.randomBytes(32).toString('hex');

    await executeQuery(
      `UPDATE users SET reset_password_token = ?, reset_password_expires = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 HOUR) WHERE id = ?`,
      [token, rows[0].id]
    );

    let baseUrl = req.headers.referer || req.headers.origin;
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
    
    // Admins redirect to the root admin login after reset
    const resetLink = `${baseUrl}/#/admin/reset-password/${token}`;
    
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
  const { token, password } = req.body;
  try {
    const rows = await executeQuery(
      `SELECT id FROM users WHERE reset_password_token = ? AND reset_password_expires > UTC_TIMESTAMP()`,
      [token]
    );

    if (rows.length === 0) {
      return res.status(400).json({ error: "Invalid or expired token" });
    }

    const hash = await bcrypt.hash(password, 12);
    await executeQuery(
      `UPDATE users SET password_hash = ?, reset_password_token = NULL, reset_password_expires = NULL WHERE id = ?`,
      [hash, rows[0].id]
    );

    res.json({ success: true });
  } catch (err) {
    logToFile("ERROR", "Admin reset password failed", { error: err.message, stack: err.stack });
    res.status(500).json({ error: "Reset failed" });
  }
};

export const setupAdminProfile = async (req, res) => {
  const { userId, fullName, password } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 12);
    
    await executeQuery(
      `UPDATE users 
       SET full_name = ?, 
           password_hash = ?, 
           must_change_password = 0, 
           updated_at = UTC_TIMESTAMP() 
       WHERE id = ?`,
      [fullName, hashedPassword, userId]
    );

    res.json({ success: true, message: "Profile setup complete" });
  } catch (err) {
    logToFile("ERROR", "Admin profile setup failed", { userId, error: err.message, stack: err.stack });
    res.status(500).json({ error: "Failed to update profile" });
  }
};

