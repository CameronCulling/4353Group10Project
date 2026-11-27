
"use strict";

const {
    validServiceId
} = require("./queueLogic");

function registerQueueRoutes(
    app,
    store,
    fail,
    auth,
    queueRepository,
    activity
) {

    // -------------------------------------------------
    // JOIN QUEUE
    // -------------------------------------------------

    app.post(
        "/api/queues/:serviceId/join",
        auth,
        (req, res) => {
            const serviceId = req.params.serviceId;

            if (!validServiceId(serviceId)) {
                return fail(res, 400, "Invalid service ID.");
            }

            try {
                const service =
                    queueRepository.findService(serviceId);

                if (!service) {
                    return fail(res, 404, "Service not found.");
                }

                const entry = queueRepository.joinQueue(
                    serviceId,
                    req.user.id
                );

                // Record the user's activity after joining.
                activity.recordJoin({
                    userId: req.user.id,
                    serviceId,
                    serviceName: service.name,
                    position: entry.position
                });

                return res.status(201).json({
                    message: "Successfully joined the queue.",
                    serviceId,
                    serviceName: service.name,
                    userId: req.user.id,
                    position: entry.position,
                    estimatedWait: entry.estimatedWait,
                    status: "waiting"
                });

            } catch (error) {
                if (
                    error.message === "Service not found."
                ) {
                    return fail(res, 404, error.message);
                }

                if (
                    error.message === "Queue is closed."
                ) {
                    return fail(res, 409, error.message);
                }

                if (
                    error.message === "Already in this queue."
                ) {
                    return fail(res, 409, error.message);
                }

                if (
                    error.message === "Invalid service ID." ||
                    error.message === "Invalid user ID."
                ) {
                    return fail(res, 400, error.message);
                }

                console.error("Join queue error:", error);
                return fail(
                    res,
                    500,
                    "Unable to join the queue."
                );
            }
        }
    );


    // -------------------------------------------------
    // LEAVE QUEUE
    // -------------------------------------------------

    app.delete(
        "/api/queues/:serviceId/leave",
        auth,
        (req, res) => {
            const serviceId = req.params.serviceId;

            if (!validServiceId(serviceId)) {
                return fail(res, 400, "Invalid service ID.");
            }

            try {
                const service =
                    queueRepository.findService(serviceId);

                if (!service) {
                    return fail(res, 404, "Service not found.");
                }

                const entry = queueRepository.leaveQueue(
                    serviceId,
                    req.user.id
                );

                if (!entry) {
                    return fail(
                        res,
                        404,
                        "You are not currently in this queue."
                    );
                }

                // Update history and create a notification.
                activity.recordLeave(
                    req.user.id,
                    serviceId,
                    service.name
                );

                return res.json({
                    message: "Successfully left the queue.",
                    serviceId
                });

            } catch (error) {
                if (
                    error.message === "Service not found."
                ) {
                    return fail(res, 404, error.message);
                }

                if (
                    error.message === "Not currently in this queue."
                ) {
                    return fail(res, 404, error.message);
                }

                if (
                    error.message === "Invalid service ID." ||
                    error.message === "Invalid user ID."
                ) {
                    return fail(res, 400, error.message);
                }

                console.error("Leave queue error:", error);
                return fail(
                    res,
                    500,
                    "Unable to leave the queue."
                );
            }
        }
    );


    // -------------------------------------------------
    // GET QUEUE STATUS
    // -------------------------------------------------

    app.get(
        "/api/queues/:serviceId/status",
        auth,
        (req, res) => {
            const serviceId = req.params.serviceId;

            if (!validServiceId(serviceId)) {
                return fail(res, 400, "Invalid service ID.");
            }

            try {
                const service =
                    queueRepository.findService(serviceId);

                if (!service) {
                    return fail(res, 404, "Service not found.");
                }

                const status =
                    queueRepository.getQueueStatus(
                        serviceId,
                        req.user.id
                    );

                if (!status) {
                    return fail(
                        res,
                        404,
                        "You are not currently in this queue."
                    );
                }

                return res.json({
                    serviceId,
                    serviceName: service.name,
                    ...status
                });

            } catch (error) {
                console.error("Get queue status error:", error);
                return fail(
                    res,
                    500,
                    "Unable to retrieve queue status."
                );
            }
        }
    );


    // -------------------------------------------------
    // GET ESTIMATED WAIT TIME
    // -------------------------------------------------

    app.get(
        "/api/queues/:serviceId/estimate",
        auth,
        (req, res) => {
            const serviceId = req.params.serviceId;

            if (!validServiceId(serviceId)) {
                return fail(res, 400, "Invalid service ID.");
            }

            try {
                const service =
                    queueRepository.findService(serviceId);

                if (!service) {
                    return fail(res, 404, "Service not found.");
                }

                const estimate =
                    queueRepository.getEstimatedPosition(
                        serviceId,
                        req.user.id
                    );

                if (!estimate) {
                    return fail(
                        res,
                        404,
                        "Queue is not available."
                    );
                }

                return res.json({
                    serviceId,
                    serviceName: service.name,
                    position: estimate.position,
                    estimatedWait: estimate.estimatedWait
                });

            } catch (error) {
                console.error("Estimate queue wait error:", error);
                return fail(
                    res,
                    500,
                    "Unable to estimate queue wait time."
                );
            }
        }
    );
}

module.exports = { registerQueueRoutes };

