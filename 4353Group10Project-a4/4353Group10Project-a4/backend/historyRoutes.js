
"use strict";

function registerHistoryRoutes(app, store, fail, auth, db) {

    app.get("/api/history", auth, (req, res) => {
        try {
            const history = db.prepare(`
                SELECT
                    history_id AS id,
                    service_id AS serviceId,
                    service_name AS serviceName,
                    joined_at AS joinedAt,
                    ended_at AS endedAt,
                    wait_minutes AS waitMinutes,
                    outcome
                FROM History
                WHERE user_id = ?
                ORDER BY joined_at DESC, history_id DESC
            `).all(req.user.id);

            return res.json({ history });
        } catch (error) {
            console.error("Get history error:", error);
            return fail(res, 500, "Unable to retrieve queue history.");
        }
    });
}

module.exports = { registerHistoryRoutes };
