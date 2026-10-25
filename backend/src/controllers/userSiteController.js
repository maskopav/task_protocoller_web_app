// backend/src/controllers/userSiteController.js
// PUT /users/:id/sites { site_ids: [] } — replaces the user's clinic set (master only).
import { executeQuery, executeTransaction } from "../db/queryHelper.js";
import { logToFile } from "../utils/logger.js";
import { refuseUnlessAdminTarget } from "./userController.js";

const parseId = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export const setUserSites = async (req, res) => {
  const userId = parseId(req.params.id);
  const raw = req.body?.site_ids;
  if (!Array.isArray(raw) || !raw.every((s) => parseId(s))) {
    return res.status(400).json({ error: "invalid_site_ids" });
  }
  const siteIds = [...new Set(raw.map(Number))];

  try {
    const refusal = await refuseUnlessAdminTarget(userId);
    if (refusal) return res.status(refusal.status).json({ error: refusal.error });

    if (siteIds.length > 0) {
      const found = await executeQuery(`SELECT id FROM sites WHERE id IN (?)`, [siteIds]);
      if (found.length !== siteIds.length) return res.status(400).json({ error: "unknown_site" });
    }

    await executeTransaction(async (conn) => {
      await conn.query(`DELETE FROM user_sites WHERE user_id = ?`, [userId]);
      for (const siteId of siteIds) {
        await conn.query(`INSERT INTO user_sites (user_id, site_id) VALUES (?, ?)`, [userId, siteId]);
      }
    });
    res.json({ success: true, site_ids: siteIds });
  } catch (err) {
    logToFile("ERROR", "Failed to set user sites", { userId, error: err.message, stack: err.stack });
    res.status(500).json({ error: "internal" });
  }
};
