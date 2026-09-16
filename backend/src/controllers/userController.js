// backend/src/controllers/userController.js
import { executeQuery } from "../db/queryHelper.js";
import bcrypt from "bcrypt";
import { logToFile } from '../utils/logger.js';
import { sendAdminWelcomeEmail } from "../utils/emailService.js";

// Fetch all users for the management table
export const getAllUsers = async (req, res) => {
    try {
        const rows = await executeQuery("SELECT * FROM v_users_management", []);
        res.json(rows);
    } catch (err) {
        logToFile("ERROR", "Failed to fetch all users", { error: err.message, stack: err.stack });
        res.status(500).json({ error: "Failed to fetch users" });
    }
};

// Simple toggle for user activation
export const toggleUserStatus = async (req, res) => {
    const { user_id, is_active } = req.body;
    try {
        await executeQuery("UPDATE users SET is_active = ? WHERE id = ?", [is_active, user_id]);
        res.json({ success: true });
    } catch (err) {
        logToFile("ERROR", "Failed to toggle user status", { 
          userId: user_id, 
          isActive: is_active, 
          error: err.message, 
          stack: err.stack 
        });
        res.status(500).json({ error: "Failed to update status" });
    }
};

export const createAdmin = async (req, res) => {
    const { email, full_name, project_ids, site_ids, can_create_projects, can_create_sites, lang = 'en' } = req.body;

    try {
        const existingUsers = await executeQuery("SELECT id FROM users WHERE email = ?", [email]);
        if (existingUsers.length > 0) {
            return res.status(400).json({ 
                error: "User with this email already exists" 
            });
        }
        // 1. Get the 'admin' role ID
        const roles = await executeQuery("SELECT id FROM roles WHERE name = 'admin'", []);
        if (roles.length === 0) return res.status(500).json({ error: "Admin role not found" });
        const adminRoleId = roles[0].id;

        // 2. Create a temporary random password
        const tempPassword = Math.random().toString(36).slice(-10);
        const passwordHash = await bcrypt.hash(tempPassword, 10);

        // 3. Insert User (Transactionally if possible, or sequential)
        const userResult = await executeQuery(
            `INSERT INTO users (email, password_hash, full_name, role_id, must_change_password, can_create_projects, can_create_sites)
             VALUES (?, ?, ?, ?, true, ?, ?)`,
            [email, passwordHash, full_name, adminRoleId,
             can_create_projects ? 1 : 0, can_create_sites ? 1 : 0]
        );
        const newUserId = userResult.insertId;

        // 4. Assign Projects if any
        if (project_ids && project_ids.length > 0) {
            for (const pid of project_ids) {
                await executeQuery("INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)", [newUserId, pid]);
            }
        }

        // 4b. Assign Sites if any. Site access is scoped through user_sites the
        // same way project access is scoped through user_projects, so a new
        // admin needs both to see anything on the dashboard.
        if (site_ids && site_ids.length > 0) {
            for (const sid of site_ids) {
                await executeQuery("INSERT INTO user_sites (user_id, site_id) VALUES (?, ?)", [newUserId, sid]);
            }
        }

        // 5. Send the Welcome Email
        // Determine Base URL from headers (Matches authController logic)
        let baseUrl = req.headers.referer || req.headers.origin;
        if (baseUrl && baseUrl.endsWith('/')) {
            baseUrl = baseUrl.slice(0, -1);
        }
        // We do this asynchronously to not block the response
        sendAdminWelcomeEmail(email, { 
            fullName: full_name, 
            tempPassword,
            loginLink: baseUrl,
        }, lang).catch(err => logToFile("ERROR", "Failed to send admin welcome email", {
            email,
            fullName: full_name,
            error: err.message,
            stack: err.stack
        }));
        
        res.status(201).json({ 
            success: true, 
            message: "Admin created successfully and notification email sent.",
            userId: newUserId 
        });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: "User with this email already exists" });
        }
        logToFile("ERROR", "Failed to create admin", { error: err.message, stack: err.stack });
        res.status(500).json({ error: "Failed to create admin" });
    }
};

export const updateUser = async (req, res) => {
    const { user_id, email, full_name, can_create_projects, can_create_sites } = req.body;
    const flag = (v) => (v === undefined ? null : (v ? 1 : 0));
    try {
        // IFNULL so a payload that omits a field leaves it alone — that is what
        // lets the admin table toggle one flag without resending the rest.
        await executeQuery(
            `UPDATE users
             SET email = IFNULL(?, email),
                 full_name = IFNULL(?, full_name),
                 can_create_projects = IFNULL(?, can_create_projects),
                 can_create_sites = IFNULL(?, can_create_sites)
             WHERE id = ?`,
            [email ?? null, full_name ?? null,
             flag(can_create_projects), flag(can_create_sites),
             user_id]
        );
        res.json({ success: true, message: "User updated successfully" });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: "Email already in use by another account" });
        }
        logToFile("ERROR", "Failed to update user", { 
          userId: user_id, 
          email, 
          error: err.message, 
          stack: err.stack 
        });
        res.status(500).json({ error: "Failed to update user" });
    }
};
