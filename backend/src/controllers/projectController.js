  // backend/src/controllers/projectController.js
  import { executeQuery } from "../db/queryHelper.js";

  export const getProjectList = async (req, res) => {
    // Extract userId and role from query parameters
    const { userId, role } = req.query;

    try {
        let query;
        let params = [];

        // Logic: Masters see all active projects. 
        // Regular admins see only assigned active projects.
        if (role === 'master' || !role || !userId) {
            query = "SELECT * FROM v_project_summary_stats";
        } else {
            query = `
                SELECT v.* FROM v_project_summary_stats v
                JOIN user_projects up ON v.project_id = up.project_id
                WHERE up.user_id = ?
            `;
            params = [userId];
        }

        const rows = await executeQuery(query, params);
        res.json(rows);
    } catch (err) {
        console.error("Error fetching project list:", err);
        res.status(500).json({ error: "Failed to fetch projects" });
    }
  };

  export const updateProject = async (req, res) => {
    const { id, name, description, frequency, country, contact_person, is_active, updated_by } = req.body;
    
    try {
        await executeQuery(
            `UPDATE projects 
             SET name = IFNULL(?, name), 
                 description = IFNULL(?, description), 
                 frequency = IFNULL(?, frequency),
                 country = IFNULL(?, country),
                 contact_person = IFNULL(?, contact_person),
                 is_active = IFNULL(?, is_active),
                 updated_at = CURRENT_TIMESTAMP, 
                 updated_by = ? 
             WHERE id = ?`,
            [name, description, frequency, country, contact_person, is_active, updated_by, id]
        );
        res.json({ success: true, message: "Project updated successfully" });
    } catch (err) {
        console.error("Update project error:", err);
        res.status(500).json({ error: "Failed to update project" });
    }
};