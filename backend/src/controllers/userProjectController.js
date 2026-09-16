// backend/src/controllers/userProjectController.js
import { executeQuery, executeTransaction } from "../db/queryHelper.js";

  // Fetch all project assignments
  export const getUserProjectAssignments = async (req, res) => {
    try {
      const rows = await executeQuery("SELECT * FROM v_user_project_assignments", []);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch assignments" });
    }
  };

  // Assign a user to a project.
  //
  // can_edit defaults to 1, which is what makes the three cases behave the way
  // a master expects without asking: granting only a clinic creates no row here
  // at all (the project is derived, and read-only), granting a project creates
  // one that carries authorship, and granting both lets the master decide.
  export const assignUserToProject = async (req, res) => {
    const { user_id, project_id, can_edit } = req.body;
    try {
      await executeQuery(
        "INSERT INTO user_projects (user_id, project_id, can_edit) VALUES (?, ?, ?)",
        [user_id, project_id, can_edit === false ? 0 : 1]
      );
      res.json({ success: true });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ error: "User is already assigned to this project." });
      }
      res.status(500).json({ error: "Failed to assign project" });
    }
  };

  // Flip the edit right on an existing assignment, so a master can hand over or
  // take back authorship without removing and re-adding the assignment.
  export const setUserProjectCanEdit = async (req, res) => {
    const { id } = req.params;
    const { can_edit } = req.body;

    if (typeof can_edit !== "boolean") {
      return res.status(400).json({ error: "can_edit must be a boolean" });
    }

    try {
      const result = await executeQuery(
        "UPDATE user_projects SET can_edit = ? WHERE id = ?",
        [can_edit ? 1 : 0, id]
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "Assignment not found" });
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to update assignment" });
    }
  };

  // Remove a project assignment from a user, and the clinic whitelist that went
  // with it. Leaving the whitelist behind means a later re-assignment silently
  // inherits a restriction nobody set this time round — the master re-assigns
  // the project and the user quietly gets fewer clinics than the project has.
  export const removeUserProjectAssignment = async (req, res) => {
    const { id } = req.params; // Using the assignment_id
    try {
        const rows = await executeQuery(
            "SELECT user_id, project_id FROM user_projects WHERE id = ?", [id]
        );
        // A blank success on a row that was not there reads as "removed"
        // in the UI and hides the fact that nothing changed.
        if (rows.length === 0) {
            return res.status(404).json({ error: "Assignment not found" });
        }
        const { user_id, project_id } = rows[0];

        await executeTransaction(async (conn) => {
            await conn.query(
                "DELETE FROM user_project_sites WHERE user_id = ? AND project_id = ?",
                [user_id, project_id]
            );
            await conn.query("DELETE FROM user_projects WHERE id = ?", [id]);
        });

        res.json({ success: true, message: "Assignment removed successfully" });
    } catch (err) {
        res.status(500).json({ error: "Failed to remove assignment" });
    }
  };
