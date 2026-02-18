// src/controllers/protocolController.js
import { executeTransaction, executeQuery } from '../db/queryHelper.js';
import { logToFile } from '../utils/logger.js';
import { generateAccessToken } from "../utils/tokenGenerator.js";

// POST
export const saveProtocol = async (req, res) => {
  logToFile(`🧩 saveProtocol called with body: ${JSON.stringify(req.body)}`);
  const { 
    protocol_group_id, 
    name, 
    language_id, 
    description, 
    version, 
    created_by, 
    updated_by, 
    tasks,
    project_id,
    editingMode,
    randomization,
    info_text,
    consent_text
  } = req.body;

  if (!Array.isArray(tasks) || tasks.length === 0) {
    logToFile(`❌ Invalid request: no tasks provided`);
    return res.status(400).json({ error: 'No tasks provided' });
  }

  // Verify project is active before allowing protocol changes
  const [project] = await executeQuery("SELECT is_active FROM projects WHERE id = ?", [project_id]);
  if (project && project.is_active === 0) {
     return res.status(403).json({ error: "Cannot edit protocols in an inactive project." });
  }

  // Check for name uniqueness if creating a NEW protocol group
  if (!editingMode) {
    const existing = await executeQuery(
      "SELECT id FROM protocols WHERE LOWER(name) = LOWER(?) AND version = 1", 
      [name]
    );
    if (existing.length > 0) {
      return res.status(409).json({ 
        error: `A protocol named "${name}" already exists. Please choose a unique name.` 
      });
    }
  }

  try {
      const protocol_id = await executeTransaction(async (conn) => {
      // Determine the protocol_group_id
      let groupId = protocol_group_id;
      if (!groupId) {
        const [rows] = await conn.query(`SELECT COALESCE(MAX(protocol_group_id), 0) + 1 AS next_group_id FROM protocols`);
        groupId = rows[0].next_group_id || 1;
      }

      let newVersion = version || 1;
      let oldProtocolId = null;

      if (editingMode) {
        // 1. Find current active version ID before we update it
        const [currentRows] = await conn.query(
          `SELECT id, version FROM protocols WHERE protocol_group_id = ? AND is_current = 1 ORDER BY version DESC`,
          [groupId]
        );
        
        
        if (currentRows.length > 0) {
          oldProtocolId = currentRows[0].id;
          newVersion = currentRows[0].version + 1;
          logToFile(currentRows);
        }

        // 2. Mark old versions as not current
        await conn.query(
          `UPDATE protocols SET is_current = 0, updated_at = NOW() WHERE protocol_group_id = ? AND is_current = 1`,
          [groupId]
        );
      }

      // Insert the new protocol
      const [result] = await conn.query(
        `INSERT INTO protocols (protocol_group_id, name, language_id, description, version, created_by, updated_by, randomization, info_text, consent_text)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          groupId,
          name || 'Placeholder Protocol',
          language_id || 1,
          description || 'Auto-created from AdminTaskEditor',
          newVersion || 1,
          created_by || 1,
          updated_by || 1,
          JSON.stringify(randomization || {}),
          info_text || null,    
          consent_text || null
        ]
      );

      const newProtocolId = result.insertId;
      logToFile(`✅ Inserted protocol with id=${newProtocolId}, group_id=${groupId}, version=${newVersion}`);

      const insertTask = `INSERT INTO protocol_tasks
        (protocol_id, task_id, task_order, params)
        VALUES (?, ?, ?, ?)`;

      for (let i = 0; i < tasks.length; i++) {
        const t = tasks[i];
        await conn.query(insertTask, [
          newProtocolId,
          t.task_id,
          t.task_order || i + 1,
          JSON.stringify(t.params || {}),
        ]);
        logToFile(`→ Added task ${t.task_id} to protocol ${newProtocolId}`);
      }

      // Generate unique token
      let accessToken = generateAccessToken();
      let unique = false;
      while (!unique) {
        const [rows] = await conn.query(
          `SELECT id FROM project_protocols WHERE access_token = ?`,
          [accessToken]
        );
        if (rows.length === 0) unique = true;
        else accessToken = generateAccessToken();
      }

      // Insert NEW project_protocols link
      const [ppResult] = await conn.query(
        `INSERT INTO project_protocols (project_id, protocol_id, access_token) VALUES (?, ?, ?)`,
        [project_id, newProtocolId, accessToken]
      );
      
      const newProjectProtocolId = ppResult.insertId;
      logToFile(`→ Created project_protocol ID ${newProjectProtocolId}`);

      // --- MIGRATION LOGIC ---
      // If editing an existing protocol within a project, migrate participants
      if (editingMode && oldProtocolId && project_id) {
                // 1. Find the OLD project_protocol ID
        const [oldPpRows] = await conn.query(
          `SELECT id FROM project_protocols WHERE project_id = ? AND protocol_id = ?;`,
          [project_id, oldProtocolId]
        );

        logToFile(`🔄 Starting participant migration from Protocol ID ${oldProtocolId} to ${newProtocolId} for ${oldPpRows.length} participants.`);
        if (oldPpRows.length > 0) {
          const oldProjectProtocolId = oldPpRows[0].id;

          // 2. Find all ACTIVE participants assigned to the old protocol
          const [participantsToMigrate] = await conn.query(
            `SELECT id, participant_id, access_token, start_date, is_active FROM participant_protocols 
             WHERE project_protocol_id = ? and end_date is NULL;`,
            [oldProjectProtocolId]
          );

          for (const p of participantsToMigrate) {
            // 3. Archive old record
            await conn.query(
              `UPDATE participant_protocols 
               SET is_active = 0, end_date = NOW(), access_token = NULL
               WHERE id = ?;`,
              [p.id]
            );

            // 4. Insert new record with SAME token
            await conn.query(
              `INSERT INTO participant_protocols 
               (participant_id, project_protocol_id, access_token, start_date, is_active)
               VALUES (?, ?, ?, ?, ?);`,
              [p.participant_id, newProjectProtocolId, p.access_token, p.start_date, p.is_active]
            );
          }
        }
      }

      return newProtocolId;
    });

    res.json({ success: true, protocol_id: protocol_id });
  } catch (err) {
    logToFile(`❌ Error saving protocol: ${err.stack || err}`);
    // Specific SQL Duplicate Entry Error (ER_DUP_ENTRY)
    if (err.errno === 1062 || err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ 
        error: "This protocol name is already taken for this version. Please use a unique name." 
      });
   }

   res.status(500).json({ error: 'Failed to save protocol. Internal server error.' });
 }
};

// GET /api/protocols/:id
export const getProtocolById = async (req, res) => {
  const { id } = req.params;
  logToFile(`📖 getProtocolById called with id=${id}`);

  try {
    // Get protocol details
    const protocolRows = await executeQuery(
      `SELECT * FROM protocols WHERE id = ?`,
      [id]
    );

    if (protocolRows.length === 0) {
      return res.status(404).json({ error: 'Protocol not found' });
    }
    const protocol = protocolRows[0];

    // Get tasks assigned to that protocol
    const taskRows = await executeQuery(
      `SELECT task_id, task_order, params
       FROM protocol_tasks
       WHERE protocol_id = ?
       ORDER BY task_order ASC`,
      [id]
    );

    // Parse params JSON
    const tasks = taskRows.map(t => ({
      ...t,
      params: t.params ? JSON.parse(t.params) : {}
    }));

    // Return structured result
    const result = { ...protocol, tasks };
    res.json(result);

  } catch (err) {
    logToFile(`❌ Error fetching protocol: ${err.stack || err}`);
    res.status(500).json({ error: 'Failed to load protocol' });
  }
};

// GET /api/protocols?project_id=X
export const getProtocolsByProjectId = async (req, res) => {
  const { project_id } = req.query;
  logToFile(`📖 getProtocolsByProjectId called with id=${project_id}`);

  try {
    let query = "SELECT * FROM v_project_protocols ORDER BY project_id, protocol_group_id, version DESC";
    const params = [];

    if (project_id) {
      query = `
      SELECT * FROM v_project_protocols WHERE project_id = ? ORDER BY project_id, protocol_group_id, version DESC`
      params.push(project_id);
    }

    const rows = await executeQuery(query, params);
    res.json(rows);
  } catch (err) {
    logToFile(`❌ Error fetching protocols: ${err.stack || err}`);
    res.status(500).json({ error: 'Failed to load protocols by projectId' });
  }
};