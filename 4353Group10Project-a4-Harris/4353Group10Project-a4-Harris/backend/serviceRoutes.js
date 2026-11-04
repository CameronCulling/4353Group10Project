"use strict";

const { randomUUID } = require("node:crypto");

const VALID_PRIORITIES = new Set(["low", "normal", "medium", "high"]);

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

    if (!Number.isInteger(body.duration) || body.duration < 1 || body.duration > 1440) {
        return "Duration must be a whole number between 1 and 1440 minutes.";
    }

    if (body.priority !== undefined &&
        (typeof body.priority !== "string" || !VALID_PRIORITIES.has(body.priority))) {
        return "Priority must be low, normal, medium, or high.";
    }

    return null;
}

function registerServiceRoutes(app, store, fail, auth) {
    // Services are readable by authenticated users and are managed by admins.
    app.get("/api/services", auth, (req, res) => {
        res.json(store.services);
    });

    app.post("/api/services", auth, (req, res) => {
        if (req.user.role !== "admin") {
            return fail(res, 403, "Administrator access required.");
        }

        const error = serviceValidationError(req.body);
        if (error) {
            return fail(res, 400, error);
        }

        const name = req.body.name.trim();
        const duplicate = store.services.some(
            service => service.name.toLowerCase() === name.toLowerCase()
        );
        if (duplicate) {
            return fail(res, 409, "A service with that name already exists.");
        }

        const service = {
            id: randomUUID(),
            name,
            description: req.body.description.trim(),
            duration: req.body.duration,
            priority: req.body.priority || "normal",
            open: false
        };

        store.services.push(service);
        if (!store.queues[service.id]) {
            store.queues[service.id] = [];
        }

        return res.status(201).json(service);
    });

    app.patch("/api/services/:serviceId", auth, (req, res) => {
        if (req.user.role !== "admin") {
            return fail(res, 403, "Administrator access required.");
        }

        const serviceId = req.params.serviceId;
        if (typeof serviceId !== "string" || !serviceId || serviceId.length > 100) {
            return fail(res, 400, "Invalid service ID.");
        }

        const service = store.services.find(item => item.id === serviceId);
        if (!service) {
            return fail(res, 404, "Service not found.");
        }

        const body = req.body;
        if (!body || typeof body !== "object" || Array.isArray(body)) {
            return fail(res, 400, "Request body must be a JSON object.");
        }

        const candidate = {
            name: body.name === undefined ? service.name : body.name,
            description: body.description === undefined ? service.description : body.description,
            duration: body.duration === undefined ? service.duration : body.duration,
            priority: body.priority === undefined ? service.priority : body.priority
        };
        const error = serviceValidationError(candidate);
        if (error) {
            return fail(res, 400, error);
        }

        const name = candidate.name.trim();
        if (store.services.some(item =>
            item.id !== serviceId && item.name.toLowerCase() === name.toLowerCase()
        )) {
            return fail(res, 409, "A service with that name already exists.");
        }

        Object.assign(service, {
            name,
            description: candidate.description.trim(),
            duration: candidate.duration,
            priority: candidate.priority
        });

        return res.json(service);
    });

    app.delete("/api/services/:serviceId", auth, (req, res) => {
        if (req.user.role !== "admin") {
            return fail(res, 403, "Administrator access required.");
        }

        const serviceId = req.params.serviceId;
        const index = store.services.findIndex(item => item.id === serviceId);
        if (index === -1) {
            return fail(res, 404, "Service not found.");
        }

        store.services.splice(index, 1);
        delete store.queues[serviceId];
        return res.json({ message: "Service deleted.", serviceId });
    });
}

module.exports = { registerServiceRoutes, serviceValidationError };