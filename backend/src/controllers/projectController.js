  // backend/src/controllers/projectController.js
  import { executeQuery } from "../db/queryHelper.js";
  import { getFollowupBookingStatusByRef, buildBookingLink, buildManageLink } from "../services/bookingServiceClient.js";
  import { BOOKING_ELIGIBILITY_DAYS } from "../config/constants.js";

  export const getProjectList = async (req, res) => {
    // req.admin comes from the verified JWT (see authMiddleware.requireAuth),
    // not from the client -- a userId/role query param here would let any
    // logged-in admin request another admin's project list, or a non-master
    // admin request `?role=master` to see every project instead of just
    // their assigned ones.
    const { id: userId, role } = req.admin;

    try {
        let query;
        let params = [];

        // Logic: Masters see all active projects.
        // Regular admins see only assigned active projects.
        if (role === 'master') {
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

  // GET /projects/:projectId/fieldwork -- replaces the old public
  // `/api/mappings?tables=v_session_summary` + client-side filter, which
  // had no auth and no project scoping at all (every participant's session
  // data, across every project, to anyone). Same access rule as the list
  // above: master sees any project, others must be assigned to this one.
  export const getProjectFieldwork = async (req, res) => {
    const { projectId } = req.params;
    const { id: userId, role } = req.admin;

    try {
        if (role !== 'master') {
            const access = await executeQuery(
                `SELECT 1 FROM user_projects WHERE user_id = ? AND project_id = ?`,
                [userId, projectId]
            );
            if (access.length === 0) {
                return res.status(403).json({ error: "Forbidden" });
            }
        }

        const rows = await executeQuery(`SELECT * FROM v_session_summary WHERE project_id = ?`, [projectId]);

        // Booking status lives in booking-service's own DB, not this one —
        // merge it in for whichever rows actually use the booking feature.
        // Skip the call entirely if nothing in this project needs it.
        if (rows.some((r) => r.enable_followup_booking)) {
            try {
                const byRef = await getFollowupBookingStatusByRef();
                for (const row of rows) {
                    if (!row.enable_followup_booking) continue;
                    const booking = byRef.get(String(row.participant_protocol_id));
                    if (booking) {
                        row.reservation_status = booking.status;
                        row.reservation_starts_at = booking.starts_at;
                        row.reservation_location = booking.location;
                        row.reservation_updated_at = booking.updated_at || booking.created_at;
                        // Only set on a 'requested' (no-slot) report -- see
                        // reportNoSlotAvailable in booking-service. The free-text
                        // note the respondent left about what would work for them.
                        row.reservation_preferred_times = booking.preferred_times || undefined;
                    }

                    // v_session_summary leaves last_activity_task_name as
                    // 'followup_booking' (instead of nulling it out like it
                    // does for every other finished session) so a respondent
                    // stuck on the reservation step still shows up in the
                    // Fieldwork table's Current Step column -- but that view
                    // can't see booking-service's own DB, so it can't tell
                    // once the reservation is actually resolved. Now that we
                    // have that status, clear it back to null the same way a
                    // normal finished session reads, instead of permanently
                    // showing a step the respondent already finished.
                    if (row.last_activity_task_name === "followup_booking" &&
                        booking && ["booked", "rescheduled", "cancelled"].includes(booking.status)) {
                        row.last_activity_task_name = null;
                    }

                    // The link must match whichever one this respondent was
                    // actually emailed. An active appointment ('booked' or
                    // 'rescheduled') was confirmed with a /manage/:manage_token
                    // link (reschedule/cancel) — see booking-service's
                    // emailService. Anyone else (never engaged, or reported
                    // "no slot works" — status 'requested') was only ever
                    // sent the original signed /book link, so that's what's
                    // surfaced here too, letting staff resend it. Only
                    // buildable once the protocol's been completed (see
                    // buildBookingLink's caller in bookingController.js).
                    const hasActiveBooking = booking && (booking.status === "booked" || booking.status === "rescheduled");
                    try {
                        if (hasActiveBooking) {
                            row.reservation_link = buildManageLink({
                                manageToken: booking.manage_token,
                                lang: row.protocol_language_code,
                            });
                        } else if (row.session_completed_at) {
                            row.reservation_link = buildBookingLink({
                                ref: row.participant_protocol_id,
                                completedAt: row.session_completed_at,
                                eligibilityDays: BOOKING_ELIGIBILITY_DAYS,
                                lang: row.protocol_language_code,
                            });
                        }
                    } catch (err) {
                        console.error("Failed to build reservation link for fieldwork row:", err);
                    }
                }
            } catch (err) {
                // booking-service being unreachable shouldn't break the whole
                // Fieldwork table — rows just show no reservation info this load.
                console.error("Failed to merge booking status into fieldwork:", err);
            }
        }

        res.json(rows);
    } catch (err) {
        console.error("Error fetching fieldwork data:", err);
        res.status(500).json({ error: "Failed to fetch fieldwork data" });
    }
  };

  export const createProject = async (req, res) => {
    const { name, description, frequency, country, contact_person, created_by } = req.body;
    
    if (!name) return res.status(400).json({ error: "Project name is required" });

    try {
        const result = await executeQuery(
            `INSERT INTO projects (name, description, frequency, country, contact_person, created_by, updated_by, start_date, updated_at, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), 1)`,
            [name, description, frequency, country, contact_person, created_by, created_by]
        );
        res.json({ success: true, id: result.insertId });
    } catch (err) {
        console.error("Create project error:", err);
        res.status(500).json({ error: "Failed to create project" });
    }
  };

  export const updateProject = async (req, res) => {
    // Destructure is_active to use it in our date logic
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
                frequency, 
                country, 
                contact_person, 
                is_active, 
                is_active, // Parameter for CASE WHEN 0
                is_active, // Parameter for CASE WHEN 1
                updated_by, 
                id
            ]
        );
        res.json({ success: true, message: "Project updated successfully" });
    } catch (err) {
        console.error("Update project error:", err);
        res.status(500).json({ error: "Failed to update project" });
    }
};