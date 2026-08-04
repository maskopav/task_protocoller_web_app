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
    const { email, full_name, project_ids, lang = 'en' } = req.body;

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
            `INSERT INTO users (email, password_hash, full_name, role_id, must_change_password) 
             VALUES (?, ?, ?, ?, true)`,
            [email, passwordHash, full_name, adminRoleId]
        );
        const newUserId = userResult.insertId;

        // 4. Assign Projects if any
        if (project_ids && project_ids.length > 0) {
            for (const pid of project_ids) {
                await executeQuery("INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)", [newUserId, pid]);
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
    const { user_id, email, full_name } = req.body;
    try {
        await executeQuery(
            "UPDATE users SET email = ?, full_name = ? WHERE id = ?",
            [email, full_name, user_id]
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
