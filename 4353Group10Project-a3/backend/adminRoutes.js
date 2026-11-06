
"use strict";

const { randomUUID } = require("node:crypto");

function registerAdminRoutes(app, store, fail, auth, db) {

    // Only administrators can access these routes.
    function requireAdmin(req, res, next) {
        if (req.user.role !== "admin") {
            return fail(res, 403, "Administrator access required.");
        }

        next();
    }

    const admin = [auth, requireAdmin];

    // Find a service in SQLite.
    function findService(serviceId) {
        return db.prepare(`
            SELECT
                service_id AS id,
                service_name AS name,
                description,
                expected_duration AS duration,
                priority_level AS priority
            FROM Service
            WHERE service_id = ?
        `).get(serviceId) || null;
    }

    // Find the most recent queue belonging to a service.
    function findQueue(serviceId) {
        return db.prepare(`
            SELECT
                queue_id AS id,
                service_id AS serviceId,
                status
            FROM Queue
            WHERE service_id = ?
            ORDER BY created_date DESC
            LIMIT 1
        `).get(serviceId) || null;
    }

    // Find a service and its associated SQLite queue.
    function getServiceQueue(req, res) {
        const serviceId = req.params.serviceId;

        if (!serviceId || serviceId.length > 100) {
            fail(res, 400, "Invalid service ID.");
            return null;
        }

        const service = findService(serviceId);

        if (!service) {
            fail(res, 404, "Service not found.");
            return null;
        }

        const queue = findQueue(serviceId);

        if (!queue) {
            fail(res, 404, "Service queue not found.");
            return null;
        }

        return {
            serviceId,
            service: {
                ...service,
                open: queue.status === "open"
            },
            queueId: queue.id
        };
    }

    // Retrieve waiting entries, including their profile names.
    function getWaitingEntries(queueId) {
        return db.prepare(`
            SELECT
                e.entry_id AS entryId,
                e.queue_id AS queueId,
                e.user_id AS userId,
                e.position,
                e.join_time AS joinedAt,
                e.status,
                p.full_name AS name
            FROM QueueEntry e
            LEFT JOIN UserProfile p
                ON p.user_id = e.user_id
            WHERE e.queue_id = ?
              AND e.status = 'waiting'
            ORDER BY e.position ASC, e.join_time ASC
        `).all(queueId);
    }

    // Recalculate positions after someone leaves or is served.
    function recalculatePositions(queueId) {
        const entries = getWaitingEntries(queueId);

        const updatePosition = db.prepare(`
            UPDATE QueueEntry
            SET position = ?
            WHERE entry_id = ?
        `);

        entries.forEach((entry, index) => {
            updatePosition.run(index + 1, entry.entryId);
        });

        return getWaitingEntries(queueId);
    }

    /*
    ==========================================
    ADMIN DASHBOARD
    ==========================================
    */

    app.get("/api/admin/dashboard", admin, (req, res) => {

        const totalServices = db.prepare(`
            SELECT COUNT(*) AS count
            FROM Service
        `).get().count;

        const openQueues = db.prepare(`
            SELECT COUNT(*) AS count
            FROM Queue
            WHERE status = 'open'
        `).get().count;

        const peopleWaiting = db.prepare(`
            SELECT COUNT(*) AS count
            FROM QueueEntry
            WHERE status = 'waiting'
        `).get().count;

        return res.json({
            totalServices,
            openQueues,
            peopleWaiting
        });
    });

    /*
    ==========================================
    VIEW ALL QUEUES
    ==========================================
    */

    app.get("/api/admin/queues", admin, (req, res) => {

        const services = db.prepare(`
            SELECT
                s.service_id AS serviceId,
                s.service_name AS serviceName,
                q.queue_id AS queueId,
                COALESCE(q.status, 'closed') AS status
            FROM Service s
            LEFT JOIN Queue q ON q.queue_id = (
                SELECT queue_id
                FROM Queue
                WHERE service_id = s.service_id
                ORDER BY created_date DESC
                LIMIT 1
            )
            ORDER BY s.service_name COLLATE NOCASE
        `).all();

        const summaries = services.map(service => {
            const waiting = service.queueId
                ? getWaitingEntries(service.queueId)
                : [];

            return {
                serviceId: service.serviceId,
                count: waiting.length,
                waiting: waiting.map(entry => ({
                    userId: entry.userId,
                    name: entry.name,
                    joinedAt: entry.joinedAt
                })),
                open: service.status === "open"
            };
        });

        return res.json(summaries);
    });

    /*
    ==========================================
    SERVE NEXT USER
    ==========================================
    */

    app.delete(
        "/api/admin/queues/:serviceId/next",
        admin,
        (req, res) => {

            const result = getServiceQueue(req, res);

            if (!result) return;

            const { queueId } = result;

            db.exec("BEGIN IMMEDIATE");

            try {
                const queue = getWaitingEntries(queueId);

                if (queue.length === 0) {
                    db.exec("ROLLBACK");

                    return fail(
                        res,
                        409,
                        "There are no users waiting."
                    );
                }

                const served = queue[0];

                db.prepare(`
                    UPDATE QueueEntry
                    SET status = 'served'
                    WHERE entry_id = ?
                `).run(served.entryId);

                const remainingQueue =
                    recalculatePositions(queueId);

                db.exec("COMMIT");

                return res.json({
                    message: "Next user is now being served.",
                    served,
                    queue: remainingQueue
                });

            } catch (error) {
                db.exec("ROLLBACK");
                console.error(error);

                return fail(
                    res,
                    500,
                    "Could not serve the next user."
                );
            }
        }
    );

    /*
    ==========================================
    REMOVE SPECIFIC USER
    ==========================================
    */

    app.delete(
        "/api/admin/queues/:serviceId/users/:userId",
        admin,
        (req, res) => {

            const result = getServiceQueue(req, res);

            if (!result) return;

            const { queueId } = result;
            const userId = req.params.userId;

            if (!userId || userId.length > 100) {
                return fail(res, 400, "Invalid user ID.");
            }

            db.exec("BEGIN IMMEDIATE");

            try {
                const removed = db.prepare(`
                    SELECT
                        e.entry_id AS entryId,
                        e.user_id AS userId,
                        e.position,
                        e.join_time AS joinedAt,
                        e.status,
                        p.full_name AS name
                    FROM QueueEntry e
                    LEFT JOIN UserProfile p
                        ON p.user_id = e.user_id
                    WHERE e.queue_id = ?
                      AND e.user_id = ?
                      AND e.status = 'waiting'
                    ORDER BY e.position ASC
                    LIMIT 1
                `).get(queueId, userId);

                if (!removed) {
                    db.exec("ROLLBACK");

                    return fail(
                        res,
                        404,
                        "Queue user not found."
                    );
                }

                db.prepare(`
                    UPDATE QueueEntry
                    SET status = 'canceled'
                    WHERE entry_id = ?
                `).run(removed.entryId);

                const remainingQueue =
                    recalculatePositions(queueId);

                db.exec("COMMIT");

                return res.json({
                    message: "User removed from queue.",
                    removed,
                    queue: remainingQueue
                });

            } catch (error) {
                db.exec("ROLLBACK");
                console.error(error);

                return fail(
                    res,
                    500,
                    "Could not remove user from queue."
                );
            }
        }
    );

    /*
    ==========================================
    OPEN / CLOSE QUEUE
    ==========================================
    */

    app.patch(
        "/api/admin/services/:serviceId/queue-status",
        admin,
        (req, res) => {

            const serviceId = req.params.serviceId;

            if (!serviceId || serviceId.length > 100) {
                return fail(res, 400, "Invalid service ID.");
            }

            if (typeof req.body?.open !== "boolean") {
                return fail(
                    res,
                    400,
                    "Open must be true or false."
                );
            }

            const service = findService(serviceId);

            if (!service) {
                return fail(res, 404, "Service not found.");
            }

            db.exec("BEGIN IMMEDIATE");

            try {
                const queue = findQueue(serviceId);

                if (queue) {
                    db.prepare(`
                        UPDATE Queue
                        SET status = ?
                        WHERE queue_id = ?
                    `).run(
                        req.body.open ? "open" : "closed",
                        queue.id
                    );
                } else {
                    // Create a queue if this older service
                    // does not have one yet.
                    db.prepare(`
                        INSERT INTO Queue (
                            queue_id,
                            service_id,
                            status
                        )
                        VALUES (?, ?, ?)
                    `).run(
                        randomUUID(),
                        serviceId,
                        req.body.open ? "open" : "closed"
                    );
                }

                db.exec("COMMIT");

                return res.json({
                    service: {
                        ...service,
                        open: req.body.open
                    }
                });

            } catch (error) {
                db.exec("ROLLBACK");
                console.error(error);

                return fail(
                    res,
                    500,
                    "Could not update queue status."
                );
            }
        }
    );
}

module.exports = { registerAdminRoutes };
