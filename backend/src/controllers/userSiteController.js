// backend/src/controllers/userSiteController.js
import { executeQuery } from "../db/queryHelper.js";

  // Fetch all site assignments
  export const getUserSiteAssignments = async (req, res) => {
    try {
      const rows = await executeQuery("SELECT * FROM v_user_site_assignments", []);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch assignments" });
    }
  };

  // Assign a user to a site
  export const assignUserToSite = async (req, res) => {
    const { user_id, site_id } = req.body;
    try {
      await executeQuery(
        "INSERT INTO user_sites (user_id, site_id) VALUES (?, ?)",
        [user_id, site_id]
      );
      res.json({ success: true });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ error: "User is already assigned to this site." });
      }
      res.status(500).json({ error: "Failed to assign site" });
    }
  };

  // Remove a site assignment from a user
  export const removeUserSiteAssignment = async (req, res) => {
    const { id } = req.params; // Using the assignment_id
    try {
        await executeQuery("DELETE FROM user_sites WHERE id = ?", [id]);
        res.json({ success: true, message: "Assignment removed successfully" });
    } catch (err) {
        res.status(500).json({ error: "Failed to remove assignment" });
    }
  };
