  // backend/src/controllers/projectController.js
  import { executeQuery } from "../db/queryHelper.js";
  import { firstInvalidEmail } from "../utils/fieldValidation.js";
  import { getVisibleProjectIds, getEditableProjectIds, canCreateProjects, ownsRecord } from "../utils/accessScope.js";

  // Masters see every project. Everyone else sees the projects resolved by
  // accessScope.js — their explicit user_projects grants, or, when they have
  // none, the projects reachable through the clinics they were given.
  //
  // The scope comes from req.admin (re-read from the DB by requireAuth), not
  // from ?userId=&role= as before: those were client-supplied, so any admin
  // could pass role=master and receive the full list.
  export const getProjectList = async (req, res) => {
    const isMaster = req.admin?.role === "master";

    try {
        if (isMaster) {
            const rows = await executeQuery("SELECT * FROM v_project_summary_stats", []);
            return res.json(rows.map((r) => ({ ...r, can_edit: true })));
        }

        const userId = req.admin?.id ?? null;
        const projectIds = await getVisibleProjectIds(userId);
        if (projectIds.length === 0) return res.json([]);

        const rows = await executeQuery(
            "SELECT * FROM v_project_summary_stats WHERE project_id IN (?)",
            [projectIds]
        );

        // can_edit lets the UI go read-only instead of letting the admin fill in
        // a protocol editor only to be refused on save. The server check in
        // saveProtocol is the actual gate; this is the hint.
        const editable = await getEditableProjectIds(userId);
        res.json(rows.map((r) => ({ ...r, can_edit: editable.includes(Number(r.project_id)) })));
    } catch (err) {
        console.error("Error fetching project list:", err);
        res.status(500).json({ error: "Failed to fetch projects" });
    }
  };

  export const createProject = async (req, res) => {
    const { name, description, countries, contact_persons, contact_emails } = req.body;
    
    if (!name) return res.status(400).json({ error: "Project name is required" });

    const badEmail = firstInvalidEmail(contact_emails);
    if (badEmail) return res.status(400).json({ error: `Not a valid email address: ${badEmail}` });

    // Creating projects is a per-user right a master switches on; it is not
    // implied by holding any existing project.
    const isMaster = req.admin?.role === "master";
    const authorId = req.admin?.id ?? null;
    if (!isMaster && !(await canCreateProjects(authorId))) {
        return res.status(403).json({ error: "You are not allowed to create projects." });
    }

    try {
        const result = await executeQuery(
            `INSERT INTO projects (name, description, countries, contact_persons, contact_emails, created_by, updated_by, start_date, updated_at, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), 1)`,
            [name, description, countries, contact_persons, contact_emails, authorId, authorId]
        );

        // The creator's own grant, written explicitly so it shows up in the
        // assignments table and a master can take it away. Access is never
        // implied by created_by — that only decides who may archive.
        if (!isMaster && authorId != null) {
            await executeQuery(
                "INSERT INTO user_projects (user_id, project_id, can_edit) VALUES (?, ?, 1)",
                [authorId, result.insertId]
            );
        }

        res.json({ success: true, id: result.insertId });
    } catch (err) {
        console.error("Create project error:", err);
        res.status(500).json({ error: "Failed to create project" });
    }
  };

  export const updateProject = async (req, res) => {
    // Destructure is_active to use it in our date logic
    const { id, name, description, countries, contact_persons, contact_emails, is_active, updated_by } = req.body;
    
    const badEmail = firstInvalidEmail(contact_emails);
    if (badEmail) return res.status(400).json({ error: `Not a valid email address: ${badEmail}` });

    // Same rule as protocols: changing a project is gated on an explicit
    // user_projects grant, never on access inherited through one of its clinics.
    const isMaster = req.admin?.role === "master";
    if (!isMaster) {
        const editable = await getEditableProjectIds(req.admin?.id ?? null);
        if (!editable.includes(Number(id))) {
            return res.status(403).json({ error: "You do not have edit rights on this project." });
        }

        // Archiving is this app's delete, and it reaches further than the
        // project: an inactive project drops out of v_site_protocols, so every
        // clinic on it stops receiving its protocols at once. Editing metadata
        // is fine with can_edit; flipping is_active is the owner's call.
        // (updateSite already restricts clinics to their creator this way.)
        if (is_active !== undefined && is_active !== null) {
            const owns = await ownsRecord(req.admin?.id ?? null, "projects", id);
            if (!owns) {
                return res.status(403).json({
                    error: "Only the project's creator can archive or restore it."
                });
            }
        }
    }

    // Authorship comes from the verified session, not the payload.
    const authorId = req.admin?.id ?? updated_by ?? null;

    try {
        await executeQuery(
            `UPDATE projects 
             SET name = IFNULL(?, name), 
                 description = IFNULL(?, description), 
                 /* IFNULL, not overwrite: ProjectManagementPage posts a partial
                    { id, is_active, updated_by } payload on the archive toggle, and
                    overwrite semantics would wipe every contact field. Omitted =>
                    unchanged, "" => cleared. */
                 countries = IFNULL(?, countries),
                 contact_persons = IFNULL(?, contact_persons),
                 contact_emails = IFNULL(?, contact_emails),
                 is_active = IFNULL(?, is_active),
                 /* Logic: If deactivated (0) -> set end_date to today. 
                    If activated (1) -> set end_date to NULL. 
                    If metadata update (null/undefined) -> keep current date. */
                 end_date = CASE 
                    WHEN ? = 0 THEN UTC_DATE() 
                    WHEN ? = 1 THEN NULL 
                    ELSE end_date 
                 END,
                 updated_at = UTC_TIMESTAMP(), 
                 updated_by = ? 
             WHERE id = ?`,
            [
                name, 
                description, 
                countries, 
                contact_persons, 
                contact_emails, 
                is_active, 
                is_active, // Parameter for CASE WHEN 0
                is_active, // Parameter for CASE WHEN 1
                authorId, 
                id
            ]
        );
        res.json({ success: true, message: "Project updated successfully" });
    } catch (err) {
        console.error("Update project error:", err);
        res.status(500).json({ error: "Failed to update project" });
    }
};