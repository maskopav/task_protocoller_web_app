// backend/src/controllers/userProjectController.js
import { executeQuery } from "../db/queryHelper.js";

  // Fetch all project assignments
  export const getUserProjectAssignments = async (req, res) => {
    try {
      const rows = await executeQuery("SELECT * FROM v_user_project_assignments", []);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch assignments" });
    }
  };

  // Assign a user to a project
  export const assignUserToProject = async (req, res) => {
    const { user_id, project_id } = req.body;
    try {
      await executeQuery(
        "INSERT INTO user_projects (user_id, project_id, assigned_at) VALUES (?, ?, UTC_TIMESTAMP())",
        [user_id, project_id]
      );
      res.json({ success: true });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ error: "User is already assigned to this project." });
      }
      res.status(500).json({ error: "Failed to assign project" });
    }
  };

  // Remove a project assignment from a user
  export const removeUserProjectAssignment = async (req, res) => {
    const { id } = req.params; // Using the assignment_id
    try {
        await executeQuery("DELETE FROM user_projects WHERE id = ?", [id]);
        res.json({ success: true, message: "Assignment removed successfully" });
    } catch (err) {
        res.status(500).json({ error: "Failed to remove assignment" });
    }
  };