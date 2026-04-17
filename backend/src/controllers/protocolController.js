// src/controllers/protocolController.js
import { executeTransaction, executeQuery } from '../db/queryHelper.js';
import { logToFile } from '../utils/logger.js';
import { generateAccessToken } from "../utils/tokenGenerator.js";

// POST
export const saveProtocol = async (req, res) => {
  logToFile(`🧩 saveProtocol called with body: ${JSON.stringify(req.body)}`);
  const { 
    protocol_group_id, name, language_id, description, version, 
    created_by, updated_by, tasks, project_id, editingMode, 
    randomization, info_text, consent_text
  } = req.body;

  if (!Array.isArray(tasks) || tasks.length === 0) {
    return res.status(400).json({ error: 'No tasks provided' });
  }

  // Identify the primary language the admin was actually editing/creating in the UI
  const sourceLanguageId = Array.isArray(language_id) ? language_id[0] : (language_id || 1);
  // Ensure language_id is an array so we can process it
  const requestLangs = Array.isArray(language_id) ? language_id : [language_id || 1];

  logToFile(`Protocol Save Details - Name: ${name}, Group ID: ${protocol_group_id}, Orig Lang: ${language_id}, Source Lang: ${sourceLanguageId}, All Langs: ${requestLangs.join(', ')}, Editing Mode: ${editingMode}`);

  // 1. UNIQUE NAME CHECK (Upgraded for Languages)
  if (!editingMode) {
    const placeholders = requestLangs.map(() => '?').join(',');
    const existing = await executeQuery(
      `SELECT id FROM protocols 
       WHERE LOWER(name) = LOWER(?) 
       AND version = 1 
       AND language_id IN (${placeholders})`, 
      [name, ...requestLangs]
    );
    
    if (existing.length > 0) {
      return res.status(409).json({ 
        error: `A protocol named "${name}" already exists for one of the selected languages. Please choose a unique name.` 
      });
    }
  }

  // 2. PROJECT ACTIVE CHECK
  const [project] = await executeQuery("SELECT is_active FROM projects WHERE id = ?", [project_id]);
  if (project && project.is_active === 0) {
     return res.status(403).json({ error: "Cannot edit protocols in an inactive project." });
  }

  try {
    const primary_protocol_id = await executeTransaction(async (conn) => {
      let groupId = protocol_group_id;
      if (!groupId) {
        const [rows] = await conn.query(`SELECT COALESCE(MAX(protocol_group_id), 0) + 1 AS next_group_id FROM protocols`);
        groupId = rows[0].next_group_id || 1;
      }

      let newVersion = version || 1;
      let syncLangs = [...requestLangs];

      if (editingMode) {
        // Get absolute highest version for this group
        const [vRows] = await conn.query(`SELECT MAX(version) as max_v FROM protocols WHERE protocol_group_id = ?`, [groupId]);
        if (vRows[0].max_v) newVersion = vRows[0].max_v + 1;

        // SMART SYNC: Find ALL currently active languages for this group so we can sync their structure
        const [activeLangs] = await conn.query(
          `SELECT language_id FROM protocols WHERE protocol_group_id = ? AND is_current = 1`,
          [groupId]
        );
        // Merge existing active languages with any NEW languages the admin selected in the UI
        const activeLangIds = activeLangs.map(r => r.language_id);
        syncLangs = Array.from(new Set([...activeLangIds, ...requestLangs]));
      }

      let firstInsertedId = null;

      // 3. LOOP THROUGH EVERY LANGUAGE TO SYNC
      for (const langId of syncLangs) {
        let oldProtocolId = null;
        let oldGlobalContents = {};
        let oldTaskContents = {}; 

        if (editingMode) {
          // Find the old version of THIS SPECIFIC LANGUAGE
          const [currentRows] = await conn.query(
            `SELECT id FROM protocols WHERE protocol_group_id = ? AND language_id = ? AND is_current = 1`,
            [groupId, langId]
          );
          
          if (currentRows.length > 0) {
            oldProtocolId = currentRows[0].id;

            // RESCUE OLD TRANSLATIONS
            const [oldContents] = await conn.query(
              `SELECT pc.protocol_task_id, pc.content_type, pc.text_html, pt.task_id 
               FROM protocol_contents pc
               LEFT JOIN protocol_tasks pt ON pc.protocol_task_id = pt.id
               WHERE pc.protocol_id = ?`,
              [oldProtocolId]
            );

            for (const c of oldContents) {
              if (!c.protocol_task_id) {
                oldGlobalContents[c.content_type] = c.text_html;
              } else {
                if (!oldTaskContents[c.task_id]) oldTaskContents[c.task_id] = {};
                oldTaskContents[c.task_id][c.content_type] = c.text_html;
              }
            }

            // Archive the old version
            await conn.query(`UPDATE protocols SET is_current = 0, updated_at = UTC_TIMESTAMP() WHERE id = ?`, [oldProtocolId]);
          }
        }

        // Insert the new protocol record
        const [result] = await conn.query(
          `INSERT INTO protocols (protocol_group_id, name, language_id, description, version, created_by, updated_by, randomization, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
          [groupId, name || 'Placeholder Protocol', langId, description || 'Auto-created from AdminTaskEditor', newVersion, created_by, updated_by, JSON.stringify(randomization || {})]
        );
        const newProtocolId = result.insertId;
        
        // Return the ID of the exact language the admin was actively editing/saving
        if (langId === sourceLanguageId) firstInsertedId = newProtocolId;
        if (!firstInsertedId) firstInsertedId = newProtocolId; // Fallback

        const isSourceLang = (langId === sourceLanguageId);

        // Save GLOBAL content (Rescue old translations if it's a sibling language)
        const finalInfoText = isSourceLang ? info_text : (oldGlobalContents['info'] !== undefined ? oldGlobalContents['info'] : info_text);
        const finalConsentText = isSourceLang ? consent_text : (oldGlobalContents['consent'] !== undefined ? oldGlobalContents['consent'] : consent_text);

        if (typeof finalInfoText === 'string' && finalInfoText.trim() !== '') {
          await conn.query(`INSERT INTO protocol_contents (protocol_id, protocol_task_id, content_type, text_html) VALUES (?, NULL, 'info', ?)`, [newProtocolId, finalInfoText]);
        }
        if (typeof finalConsentText === 'string' && finalConsentText.trim() !== '') {
          await conn.query(`INSERT INTO protocol_contents (protocol_id, protocol_task_id, content_type, text_html) VALUES (?, NULL, 'consent', ?)`, [newProtocolId, finalConsentText]);
        }

        // Save TASK-SPECIFIC content (Syncing structure, rescuing translations)
        const insertTask = `INSERT INTO protocol_tasks (protocol_id, task_id, task_order, params) VALUES (?, ?, ?, ?)`;
        for (let i = 0; i < tasks.length; i++) {
          const t = tasks[i];
          
          const [taskResult] = await conn.query(insertTask, [newProtocolId, t.task_id, t.task_order || i + 1, JSON.stringify(t.params || {})]);
          const newProtocolTaskId = taskResult.insertId;

          if (t.contents && Array.isArray(t.contents)) {
            for (const content of t.contents) {
               if (content.html && content.html.trim() !== '') {
                  
                  // Translation Rescue Logic
                  let finalHtml = content.html; 
                  if (!isSourceLang && oldTaskContents[t.task_id] && oldTaskContents[t.task_id][content.type] !== undefined) {
                      finalHtml = oldTaskContents[t.task_id][content.type]; // Use old translation
                  }

                  await conn.query(`INSERT INTO protocol_contents (protocol_id, protocol_task_id, content_type, text_html) VALUES (?, ?, ?, ?)`, [newProtocolId, newProtocolTaskId, content.type, finalHtml]);
               }
            }
          }
        }

        // Token & project_protocol connection
        let accessToken = generateAccessToken();
        let unique = false;
        while (!unique) {
          const [rows] = await conn.query(`SELECT id FROM project_protocols WHERE access_token = ?`, [accessToken]);
          if (rows.length === 0) unique = true;
          else accessToken = generateAccessToken();
        }

        const [ppResult] = await conn.query(
          `INSERT INTO project_protocols (project_id, protocol_id, access_token) VALUES (?, ?, ?)`,
          [project_id, newProtocolId, accessToken]
        );
        const newProjectProtocolId = ppResult.insertId;

        // Migration logic for participants
        if (editingMode && oldProtocolId && project_id) {
          const [oldPpRows] = await conn.query(`SELECT id FROM project_protocols WHERE project_id = ? AND protocol_id = ?`, [project_id, oldProtocolId]);
          if (oldPpRows.length > 0) {
            const [participants] = await conn.query(
              `SELECT id, participant_id, access_token, start_date, is_active FROM participant_protocols WHERE project_protocol_id = ? AND end_date IS NULL`, 
              [oldPpRows[0].id]
            );
            for (const p of participants) {
              await conn.query(`UPDATE participant_protocols SET is_active = 0, end_date = UTC_TIMESTAMP(), access_token = NULL WHERE id = ?`, [p.id]);
              await conn.query(
                `INSERT INTO participant_protocols (participant_id, project_protocol_id, access_token, start_date, is_active) VALUES (?, ?, ?, ?, ?)`,
                [p.participant_id, newProjectProtocolId, p.access_token, p.start_date, p.is_active]
              );
            }
          }
        }
      }

      return firstInsertedId;
    });

    res.json({ success: true, protocol_id: primary_protocol_id });
  } catch (err) {
    logToFile(`❌ Error saving protocol: ${err.stack || err}`);
    if (err.errno === 1062 || err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: "This protocol name is already taken for this version and language. Please use a unique name." });
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
    if (protocol.randomization && typeof protocol.randomization === 'string') {
      try {
          protocol.randomization = JSON.parse(protocol.randomization);
      } catch (e) {
          protocol.randomization = {};
      }
    }

    // Fetch all active sibling languages for this protocol group
    const siblingRows = await executeQuery(
      `SELECT l.code, p.id as protocol_id
       FROM protocols p
       JOIN languages l ON p.language_id = l.id
       WHERE p.protocol_group_id = ? AND p.is_current = 1`,
      [protocol.protocol_group_id]
    );

    // Sort the languages so the one we are actively fetching is first in the array
    const primaryLangRow = siblingRows.find(row => row.protocol_id === parseInt(id));
    const primaryCode = primaryLangRow ? primaryLangRow.code : 'en';
    const otherCodes = siblingRows.filter(row => row.protocol_id !== parseInt(id)).map(r => r.code);
    const finalLanguageArray = [primaryCode, ...otherCodes];

    // 1. Get the new content rows
    const contents = await executeQuery(
      `SELECT protocol_task_id, content_type, text_html FROM protocol_contents WHERE protocol_id = ?`,
      [id]
    );

    // 2. Map contents
    const contentMap = contents.reduce((acc, c) => {
      const key = c.protocol_task_id || 'global';
      if (!acc[key]) acc[key] = [];
      acc[key].push({ type: c.content_type, html: c.text_html });
      return acc;
    }, {});

    // 3. Create a helper object to restore the old 'info_text' and 'consent_text' fields
    const globalFields = {};
    (contentMap['global'] || []).forEach(c => {
      // Maps 'info' -> 'info_text' and 'consent' -> 'consent_text'
      globalFields[`${c.type}_text`] = c.html;
    });

    const taskRows = await executeQuery(
      `SELECT id, task_id, task_order, params FROM protocol_tasks WHERE protocol_id = ? ORDER BY task_order ASC`,
      [id]
    );

    const tasks = taskRows.map(t => ({
      ...t,
      params: t.params ? JSON.parse(t.params) : {},
      contents: contentMap[t.id] || []
    }));

    // 4. Spread globalFields into the result so the frontend sees .info_text
    res.json({ 
      ...protocol, 
      language: finalLanguageArray,
      ...globalFields, // RESTORES info_text and consent_text
      global_contents: contentMap['global'] || [],
      tasks 
    });

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