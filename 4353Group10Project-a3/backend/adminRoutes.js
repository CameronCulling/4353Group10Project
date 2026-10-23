"use strict";

const {
    recordQueueExit,
    notifyNearbyUsers
} = require("./activityLogic");

function registerAdminRoutes(app, store, fail, auth) {

    // Only administrators can access these routes.
    function requireAdmin(req, res, next) {
        if (req.user.role !== "admin") {
            return fail(res, 403, "Administrator access required.");
        }

        next();
    }

    const admin = [auth, requireAdmin];

    // Find a service and its associated queue.
    function getServiceQueue(req, res) {
        const serviceId = req.params.serviceId;

        if (!serviceId || serviceId.length > 100) {
            fail(res, 400, "Invalid service ID.");
            return null;
        }

        const service = store.services.find(
            item => item.id === serviceId
        );

        if (!service) {
            fail(res, 404, "Service not found.");
            return null;
        }

        const queue = store.queues[serviceId];

        if (!Array.isArray(queue)) {
            fail(res, 500, "Service queue is unavailable.");
            return null;
        }

        return {
            serviceId,
            service,
            queue
        };
    }

    /*
    ==========================================
    ADMIN DASHBOARD
    ==========================================
    */

    app.get("/api/admin/dashboard", admin, (req, res) => {

        const totalServices = store.services.length;

        const openQueues = store.services.filter(
            service => service.open === true
        ).length;

        const peopleWaiting = store.services.reduce(
            (total, service) => {
                const queue = store.queues[service.id] || [];
                return total + queue.length;
            },
            0
        );

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

        const summaries = store.services.map(service => {

            const queue = store.queues[service.id] || [];

            return {
                serviceId: service.id,
                count: queue.length,
                waiting: queue.map(entry => ({
                    userId: entry.userId,
                    name: entry.name,
                    joinedAt: entry.joinedAt
                }))
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

            const { service, queue } = result;

            if (queue.length === 0) {
                return fail(
                    res,
                    409,
                    "There are no users waiting."
                );
            }

            // Get the first user without removing them yet.
            const served = queue[0];

            // Update their history before removing them.
            recordQueueExit(
                store,
                served.userId,
                service,
                served,
                "served"
            );

            // Remove the first person.
            queue.shift();

            // Notify users who moved closer to the front.
            notifyNearbyUsers(
                store,
                service,
                queue
            );

            return res.json({
                message: "Next user is now being served.",
                served,
                queue
            });
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

            const { service, queue } = result;

            const userId = req.params.userId;

            if (!userId || userId.length > 100) {
                return fail(res, 400, "Invalid user ID.");
            }

            const index = queue.findIndex(
                entry => entry.userId === userId
            );

            if (index === -1) {
                return fail(
                    res,
                    404,
                    "Queue user not found."
                );
            }

            // Get the user before removing them.
            const removed = queue[index];

            // Record that they left the queue.
            recordQueueExit(
                store,
                removed.userId,
                service,
                removed,
                "left"
            );

            // Remove the user.
            queue.splice(index, 1);

            // Notify users who moved closer to the front.
            notifyNearbyUsers(
                store,
                service,
                queue
            );

            return res.json({
                message: "User removed from queue.",
                removed,
                queue
            });
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

            const result = getServiceQueue(req, res);

            if (!result) return;

            if (typeof req.body?.open !== "boolean") {
                return fail(
                    res,
                    400,
                    "Open must be true or false."
                );
            }

            result.service.open = req.body.open;

            return res.json({
                service: result.service
            });
        }
    );
}

module.exports = { registerAdminRoutes };