
"use strict";

function registerNotificationRoutes(app, store, fail, auth, db) {

    // Get all notifications belonging to the logged-in user.
    app.get("/api/notifications", auth, (req, res) => {
        try {
            const notifications = db.prepare(`
                SELECT
                    notification_id AS id,
                    type,
                    message,
                    timestamp,
                    status = 'viewed' AS read
                FROM Notification
                WHERE user_id = ?
                ORDER BY timestamp DESC, notification_id DESC
            `).all(req.user.id);

            const unreadCount = notifications.filter(
                item => !item.read
            ).length;

            return res.json({
                notifications,
                unreadCount
            });
        } catch (error) {
            console.error("Get notifications error:", error);
            return fail(res, 500, "Unable to retrieve notifications.");
        }
    });

    // Mark all unread notifications as read.
    app.patch("/api/notifications/read-all", auth, (req, res) => {
        try {
            const result = db.prepare(`
                UPDATE Notification
                SET status = 'viewed'
                WHERE user_id = ?
                  AND status = 'sent'
            `).run(req.user.id);

            return res.json({
                message: "All notifications marked as read.",
                updatedCount: Number(result.changes)
            });
        } catch (error) {
            console.error("Read all notifications error:", error);
            return fail(res, 500, "Unable to update notifications.");
        }
    });

    // Mark one notification as read or unread.
    app.patch("/api/notifications/:id", auth, (req, res) => {
        const id = req.params.id;

        if (
            typeof id !== "string" ||
            id.trim().length === 0 ||
            id.length > 100
        ) {
            return fail(res, 400, "Invalid notification ID.");
        }

        const body = req.body;

        if (
            !body ||
            typeof body !== "object" ||
            Array.isArray(body) ||
            typeof body.read !== "boolean"
        ) {
            return fail(res, 400, "A boolean read value is required.");
        }

        try {
            const notification = db.prepare(`
                SELECT notification_id
                FROM Notification
                WHERE notification_id = ?
                  AND user_id = ?
            `).get(id, req.user.id);

            if (!notification) {
                return fail(res, 404, "Notification not found.");
            }

            db.prepare(`
                UPDATE Notification
                SET status = ?
                WHERE notification_id = ?
                  AND user_id = ?
            `).run(
                body.read ? "viewed" : "sent",
                id,
                req.user.id
            );

            return res.json({
                id,
                read: body.read
            });
        } catch (error) {
            console.error("Update notification error:", error);
            return fail(res, 500, "Unable to update notification.");
        }
    });


}

module.exports = { registerNotificationRoutes };
