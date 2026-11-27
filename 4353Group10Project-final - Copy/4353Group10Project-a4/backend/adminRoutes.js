
"use strict";

const { randomUUID } = require("node:crypto");

function registerAdminRoutes(
    app,
    store,
    fail,
    auth,
    db,
    activity
) {

    // -------------------------------------------------
    // ADMIN AUTHORIZATION
    // -------------------------------------------------

    function requireAdmin(req, res, next) {
        if (!req.user || req.user.role !== "admin") {
            return fail(
                res,
                403,
                "Administrator access required."
            );
        }

        next();
    }

    const admin = [auth, requireAdmin];


    // -------------------------------------------------
    // DATABASE HELPERS
    // -------------------------------------------------

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

    function findQueue(serviceId) {
        return db.prepare(`
            SELECT
                queue_id AS id,
                service_id AS serviceId,
                status
            FROM Queue
            WHERE service_id = ?
            ORDER BY created_date DESC, queue_id DESC
            LIMIT 1
        `).get(serviceId) || null;
    }

    function getServiceQueue(req, res) {
        const serviceId = req.params.serviceId;

        if (
            typeof serviceId !== "string" ||
            serviceId.trim().length === 0 ||
            serviceId.length > 100
        ) {
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

    function getQueueSummary(serviceId, queueId) {
        const waiting = getWaitingEntries(queueId);

        return {
            serviceId,
            count: waiting.length,
            waiting
        };
    }


    // -------------------------------------------------
    // ADMIN DASHBOARD
    // -------------------------------------------------

    app.get(
        "/api/admin/dashboard",
        ...admin,
        (req, res) => {
            try {
                const totalServices = db.prepare(`
                    SELECT COUNT(*) AS count
                    FROM Service
                `).get().count;

                const openQueues = db.prepare(`
                    SELECT COUNT(DISTINCT service_id) AS count
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

            } catch (error) {
                console.error("Admin dashboard error:", error);
                return fail(
                    res,
                    500,
                    "Unable to retrieve dashboard statistics."
                );
            }
        }
    );


    // -------------------------------------------------
    // VIEW ALL SERVICE QUEUES
    // -------------------------------------------------

    app.get(
        "/api/admin/queues",
        ...admin,
        (req, res) => {
            try {
                const services = db.prepare(`
                    SELECT
                        service_id AS serviceId,
                        service_name AS serviceName,
                        expected_duration AS duration,
                        priority_level AS priority
                    FROM Service
                    ORDER BY service_name
                `).all();

                const summaries = services.map(service => {
                    const queue = findQueue(service.serviceId);

                    const waiting = queue
                        ? getWaitingEntries(queue.id)
                        : [];

                    return {
                        serviceId: service.serviceId,
                        serviceName: service.serviceName,
                        duration: service.duration,
                        priority: service.priority,
                        open: queue
                            ? queue.status === "open"
                            : false,
                        count: waiting.length,
                        waiting
                    };
                });

                return res.json(summaries);

            } catch (error) {
                console.error("Admin queues error:", error);
                return fail(
                    res,
                    500,
                    "Unable to retrieve queue summaries."
                );
            }
        }
    );


    // -------------------------------------------------
    // SERVE THE NEXT PERSON
    // -------------------------------------------------

    app.delete(
        "/api/admin/queues/:serviceId/next",
        ...admin,
        (req, res) => {
            const serviceId = req.params.serviceId;

            if (
                typeof serviceId !== "string" ||
                serviceId.trim().length === 0 ||
                serviceId.length > 100
            ) {
                return fail(res, 400, "Invalid service ID.");
            }

            const service = findService(serviceId);

            if (!service) {
                return fail(res, 404, "Service not found.");
            }

            const queue = findQueue(serviceId);

            if (!queue) {
                return fail(res, 404, "Service queue not found.");
            }

            let servedEntry;

            try {
                db.exec("BEGIN IMMEDIATE");

                const firstEntry = db.prepare(`
                    SELECT
                        entry_id AS entryId,
                        user_id AS userId,
                        position
                    FROM QueueEntry
                    WHERE queue_id = ?
                      AND status = 'waiting'
                    ORDER BY position ASC, join_time ASC
                    LIMIT 1
                `).get(queue.id);

                if (!firstEntry) {
                    db.exec("ROLLBACK");

                    return fail(
                        res,
                        409,
                        "There is nobody waiting in this queue."
                    );
                }

                db.prepare(`
                    UPDATE QueueEntry
                    SET status = 'served'
                    WHERE entry_id = ?
                `).run(firstEntry.entryId);

                servedEntry = firstEntry;

                const waiting = recalculatePositions(queue.id);

                db.exec("COMMIT");

                // Update activity only after the queue
                // transaction has successfully committed.
                activity.recordServed(
                    servedEntry.userId,
                    serviceId,
                    service.name
                );

                return res.json({
                    message: "Next person served successfully.",
                    served: servedEntry,
                    queue: {
                        serviceId,
                        count: waiting.length,
                        waiting
                    }
                });

            } catch (error) {
                try {
                    db.exec("ROLLBACK");
                } catch {
                    // Transaction may already have ended.
                }

                console.error("Serve next error:", error);

                return fail(
                    res,
                    500,
                    "Unable to serve the next person."
                );
            }
        }
    );


    // -------------------------------------------------
    // REMOVE A SPECIFIC USER FROM A QUEUE
    // -------------------------------------------------

    app.delete(
        "/api/admin/queues/:serviceId/users/:userId",
        ...admin,
        (req, res) => {
            const { serviceId, userId } = req.params;

            if (
                typeof serviceId !== "string" ||
                serviceId.trim().length === 0 ||
                serviceId.length > 100 ||
                typeof userId !== "string" ||
                userId.trim().length === 0 ||
                userId.length > 100
            ) {
                return fail(
                    res,
                    400,
                    "Invalid service or user ID."
                );
            }

            const service = findService(serviceId);

            if (!service) {
                return fail(res, 404, "Service not found.");
            }

            const queue = findQueue(serviceId);

            if (!queue) {
                return fail(res, 404, "Service queue not found.");
            }

            let removedEntry;
            let waiting;

            try {
                db.exec("BEGIN IMMEDIATE");

                removedEntry = db.prepare(`
                    SELECT
                        entry_id AS entryId,
                        user_id AS userId,
                        position
                    FROM QueueEntry
                    WHERE queue_id = ?
                      AND user_id = ?
                      AND status = 'waiting'
                    LIMIT 1
                `).get(queue.id, userId);

                if (!removedEntry) {
                    db.exec("ROLLBACK");

                    return fail(
                        res,
                        404,
                        "User is not waiting in this queue."
                    );
                }

                db.prepare(`
                    UPDATE QueueEntry
                    SET status = 'canceled'
                    WHERE entry_id = ?
                `).run(removedEntry.entryId);

                waiting = recalculatePositions(queue.id);

                db.exec("COMMIT");

                // Record cancellation after the queue
                // transaction has committed.
                activity.recordCanceled(
                    removedEntry.userId,
                    serviceId,
                    service.name
                );

                return res.json({
                    message: "User removed from queue.",
                    removed: removedEntry,
                    queue: {
                        serviceId,
                        count: waiting.length,
                        waiting
                    }
                });

            } catch (error) {
                try {
                    db.exec("ROLLBACK");
                } catch {
                    // Transaction may already have ended.
                }

                console.error("Remove queue user error:", error);

                return fail(
                    res,
                    500,
                    "Unable to remove user from queue."
                );
            }
        }
    );


    // -------------------------------------------------
    // OPEN OR CLOSE A SERVICE QUEUE
    // -------------------------------------------------

    app.patch(
        "/api/admin/services/:serviceId/queue-status",
        ...admin,
        (req, res) => {
            const serviceId = req.params.serviceId;

            if (
                typeof serviceId !== "string" ||
                serviceId.trim().length === 0 ||
                serviceId.length > 100
            ) {
                return fail(res, 400, "Invalid service ID.");
            }

            if (
                !req.body ||
                typeof req.body !== "object" ||
                Array.isArray(req.body) ||
                typeof req.body.open !== "boolean"
            ) {
                return fail(
                    res,
                    400,
                    "Queue status must be a boolean."
                );
            }

            const service = findService(serviceId);

            if (!service) {
                return fail(res, 404, "Service not found.");
            }

            try {
                db.exec("BEGIN IMMEDIATE");

                const queue = findQueue(serviceId);

                if (req.body.open) {
                    // Close any other open queues for this service.
                    db.prepare(`
                        UPDATE Queue
                        SET status = 'closed'
                        WHERE service_id = ?
                          AND status = 'open'
                    `).run(serviceId);

                    if (queue) {
                        db.prepare(`
                            UPDATE Queue
                            SET status = 'open'
                            WHERE queue_id = ?
                        `).run(queue.id);
                    } else {
                        db.prepare(`
                            INSERT INTO Queue (
                                queue_id,
                                service_id,
                                status
                            )
                            VALUES (?, ?, 'open')
                        `).run(randomUUID(), serviceId);
                    }

                } else {
                    db.prepare(`
                        UPDATE Queue
                        SET status = 'closed'
                        WHERE service_id = ?
                    `).run(serviceId);
                }

                db.exec("COMMIT");

                const updatedQueue = findQueue(serviceId);

                return res.json({
                    message: req.body.open
                        ? "Queue opened successfully."
                        : "Queue closed successfully.",
                    service: {
                        ...service,
                        open: updatedQueue
                            ? updatedQueue.status === "open"
                            : false
                    }
                });

            } catch (error) {
                try {
                    db.exec("ROLLBACK");
                } catch {
                    // Transaction may already have ended.
                }

                console.error("Queue status update error:", error);

                return fail(
                    res,
                    500,
                    "Unable to update queue status."
                );
            }
        }
    );
}

module.exports = { registerAdminRoutes };
