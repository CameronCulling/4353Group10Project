
"use strict";

const {
    estimateWait,
    validServiceId
} = require("./queueLogic");

function registerQueueRoutes(
    app,
    store,
    fail,
    auth,
    queueRepository
) {

    // JOIN QUEUE
    app.post("/api/queues/:serviceId/join", auth, (req, res) => {
        const { serviceId } = req.params;

        if (!validServiceId(serviceId)) {
            return fail(res, 400, "Invalid service ID.");
        }

        const service = queueRepository.findService(serviceId);

        if (!service) {
            return fail(res, 404, "Service not found.");
        }

        try {
            const entry = queueRepository.joinQueue(
                serviceId,
                req.user.id
            );

            return res.status(201).json({
                message: "Successfully joined queue.",
                serviceId,
                serviceName: service.name,
                userId: req.user.id,
                position: entry.position,
                estimatedWait: estimateWait(
                    entry.position,
                    service.duration
                ),
                status: "waiting"
            });

        } catch (error) {
            if (error.message === "Service not found.") {
                return fail(res, 404, error.message);
            }

            if (error.message === "Invalid user ID.") {
                return fail(res, 400, error.message);
            }

            return fail(res, 409, error.message);
        }
    });


    // LEAVE QUEUE
    app.delete("/api/queues/:serviceId/leave", auth, (req, res) => {
        const { serviceId } = req.params;

        if (!validServiceId(serviceId)) {
            return fail(res, 400, "Invalid service ID.");
        }

        const service = queueRepository.findService(serviceId);

        if (!service) {
            return fail(res, 404, "Service not found.");
        }

        try {
            queueRepository.leaveQueue(
                serviceId,
                req.user.id
            );

            return res.json({
                message: "Successfully left queue.",
                serviceId
            });

        } catch (error) {
            if (error.message === "User is not in this queue.") {
                return fail(res, 404, error.message);
            }

            if (error.message === "Invalid user ID.") {
                return fail(res, 400, error.message);
            }

            return fail(res, 409, error.message);
        }
    });


    // GET CURRENT QUEUE STATUS
    app.get("/api/queues/:serviceId/status", auth, (req, res) => {
        const { serviceId } = req.params;

        if (!validServiceId(serviceId)) {
            return fail(res, 400, "Invalid service ID.");
        }

        const service = queueRepository.findService(serviceId);

        if (!service) {
            return fail(res, 404, "Service not found.");
        }

        const status = queueRepository.getQueueStatus(
            serviceId,
            req.user.id
        );

        if (!status) {
            return fail(res, 404, "You are not in this queue.");
        }

        return res.json({
            serviceId,
            serviceName: service.name,
            ...status
        });
    });


    // GET ESTIMATED WAIT BEFORE JOINING
    app.get("/api/queues/:serviceId/estimate", auth, (req, res) => {
        const { serviceId } = req.params;

        if (!validServiceId(serviceId)) {
            return fail(res, 400, "Invalid service ID.");
        }

        const service = queueRepository.findService(serviceId);

        if (!service) {
            return fail(res, 404, "Service not found.");
        }

        const estimate = queueRepository.getEstimatedPosition(
            serviceId,
            req.user.id
        );

        if (!estimate) {
            return fail(
                res,
                409,
                "This service is currently closed."
            );
        }

        return res.json({
            serviceId,
            serviceName: service.name,
            position: estimate.position,
            estimatedWait: estimate.estimatedWait
        });
    });
}

module.exports = { registerQueueRoutes };
