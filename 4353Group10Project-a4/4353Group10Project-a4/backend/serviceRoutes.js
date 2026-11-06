
"use strict";

const { randomUUID } = require("node:crypto");

const VALID_PRIORITIES = new Set([
    "low",
    "normal",
    "medium",
    "high"
]);

function serviceValidationError(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return "Request body must be a JSON object.";
    }

    if (typeof body.name !== "string" || !body.name.trim()) {
        return "Service name is required and must be a string.";
    }

    if (body.name.trim().length > 100) {
        return "Service name must be 100 characters or fewer.";
    }

    if (typeof body.description !== "string" || !body.description.trim()) {
        return "Service description is required and must be a string.";
    }

    if (body.description.trim().length > 500) {
        return "Service description must be 500 characters or fewer.";
    }

    if (!Number.isInteger(body.duration) ||
        body.duration < 1 ||
        body.duration > 1440) {
        return "Duration must be a whole number between 1 and 1440 minutes.";
    }

    if (
        body.priority !== undefined &&
        (
            typeof body.priority !== "string" ||
            !VALID_PRIORITIES.has(body.priority)
        )
    ) {
        return "Priority must be low, normal, medium, or high.";
    }

    return null;
}

function registerServiceRoutes(app, store, fail, auth, db) {

    // Retrieve services from SQLite.
    function getAllServices() {
        return db.prepare(`
            SELECT
                s.service_id AS id,
                s.service_name AS name,
                s.description,
                s.expected_duration AS duration,
                s.priority_level AS priority,
                COALESCE(q.status, 'closed') = 'open' AS open
            FROM Service s
            LEFT JOIN Queue q ON q.queue_id = (
                SELECT queue_id
                FROM Queue
                WHERE service_id = s.service_id
                ORDER BY created_date DESC
                LIMIT 1
            )
            ORDER BY s.service_name COLLATE NOCASE
        `).all().map(service => ({
            ...service,
            open: Boolean(service.open)
        }));
    }

    // GET ALL SERVICES
    app.get("/api/services", auth, (req, res) => {
        return res.json(getAllServices());
    });

    // CREATE SERVICE
    app.post("/api/services", auth, (req, res) => {
        if (req.user.role !== "admin") {
            return fail(res, 403, "Administrator access required.");
        }

        const error = serviceValidationError(req.body);

        if (error) {
            return fail(res, 400, error);
        }

        const name = req.body.name.trim();

        const duplicate = db.prepare(`
            SELECT service_id
            FROM Service
            WHERE service_name = ? COLLATE NOCASE
        `).get(name);

        if (duplicate) {
            return fail(
                res,
                409,
                "A service with that name already exists."
            );
        }

        const serviceId = randomUUID();
        const queueId = randomUUID();

        const service = {
            id: serviceId,
            name,
            description: req.body.description.trim(),
            duration: req.body.duration,
            priority: req.body.priority || "normal",
            open: false
        };

        db.exec("BEGIN IMMEDIATE");

        try {
            db.prepare(`
                INSERT INTO Service (
                    service_id,
                    service_name,
                    description,
                    expected_duration,
                    priority_level
                )
                VALUES (?, ?, ?, ?, ?)
            `).run(
                service.id,
                service.name,
                service.description,
                service.duration,
                service.priority
            );

            // Every new service starts with a closed queue.
            db.prepare(`
                INSERT INTO Queue (
                    queue_id,
                    service_id,
                    status
                )
                VALUES (?, ?, 'closed')
            `).run(queueId, service.id);

            db.exec("COMMIT");

            return res.status(201).json(service);

        } catch (error) {
            db.exec("ROLLBACK");
            console.error(error);

            return fail(
                res,
                500,
                "Could not create service."
            );
        }
    });

    // UPDATE SERVICE
    app.patch("/api/services/:serviceId", auth, (req, res) => {
        if (req.user.role !== "admin") {
            return fail(res, 403, "Administrator access required.");
        }

        const serviceId = req.params.serviceId;

        if (
            typeof serviceId !== "string" ||
            !serviceId ||
            serviceId.length > 100
        ) {
            return fail(res, 400, "Invalid service ID.");
        }

        const existing = db.prepare(`
            SELECT
                service_id AS id,
                service_name AS name,
                description,
                expected_duration AS duration,
                priority_level AS priority
            FROM Service
            WHERE service_id = ?
        `).get(serviceId);

        if (!existing) {
            return fail(res, 404, "Service not found.");
        }

        const body = req.body;

        if (!body || typeof body !== "object" || Array.isArray(body)) {
            return fail(res, 400, "Request body must be a JSON object.");
        }

        const candidate = {
            name: body.name === undefined ? existing.name : body.name,
            description: body.description === undefined
                ? existing.description
                : body.description,
            duration: body.duration === undefined
                ? existing.duration
                : body.duration,
            priority: body.priority === undefined
                ? existing.priority
                : body.priority
        };

        const error = serviceValidationError(candidate);

        if (error) {
            return fail(res, 400, error);
        }

        const name = candidate.name.trim();

        const duplicate = db.prepare(`
            SELECT service_id
            FROM Service
            WHERE service_name = ? COLLATE NOCASE
              AND service_id != ?
        `).get(name, serviceId);

        if (duplicate) {
            return fail(
                res,
                409,
                "A service with that name already exists."
            );
        }

        db.prepare(`
            UPDATE Service
            SET
                service_name = ?,
                description = ?,
                expected_duration = ?,
                priority_level = ?
            WHERE service_id = ?
        `).run(
            name,
            candidate.description.trim(),
            candidate.duration,
            candidate.priority,
            serviceId
        );

        return res.json({
            id: serviceId,
            name,
            description: candidate.description.trim(),
            duration: candidate.duration,
            priority: candidate.priority,
            open: Boolean(
                db.prepare(`
                    SELECT 1
                    FROM Queue
                    WHERE service_id = ?
                      AND status = 'open'
                `).get(serviceId)
            )
        });
    });

    // DELETE SERVICE
    app.delete("/api/services/:serviceId", auth, (req, res) => {
        if (req.user.role !== "admin") {
            return fail(res, 403, "Administrator access required.");
        }

        const serviceId = req.params.serviceId;

        if (
            typeof serviceId !== "string" ||
            !serviceId ||
            serviceId.length > 100
        ) {
            return fail(res, 400, "Invalid service ID.");
        }

        const service = db.prepare(`
            SELECT service_id
            FROM Service
            WHERE service_id = ?
        `).get(serviceId);

        if (!service) {
            return fail(res, 404, "Service not found.");
        }

        db.exec("BEGIN IMMEDIATE");

        try {
            // Remove entries first because the schema has foreign keys.
            db.prepare(`
                DELETE FROM QueueEntry
                WHERE queue_id IN (
                    SELECT queue_id
                    FROM Queue
                    WHERE service_id = ?
                )
            `).run(serviceId);

            db.prepare(`
                DELETE FROM Queue
                WHERE service_id = ?
            `).run(serviceId);

            db.prepare(`
                DELETE FROM Service
                WHERE service_id = ?
            `).run(serviceId);

            db.exec("COMMIT");

            return res.json({
                message: "Service deleted.",
                serviceId
            });

        } catch (error) {
            db.exec("ROLLBACK");
            console.error(error);

            return fail(
                res,
                500,
                "Could not delete service."
            );
        }
    });
}

module.exports = {
    registerServiceRoutes,
    serviceValidationError
};