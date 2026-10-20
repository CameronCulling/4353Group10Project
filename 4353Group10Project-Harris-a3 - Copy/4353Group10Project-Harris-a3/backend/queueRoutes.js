const {
    estimateWait,
    joinQueue,
    leaveQueue,
    getQueueStatus
} = require("./queueLogic");

function registerQueueRoutes(app, store, fail, auth) {

    // Temporary services until teammate's service module is ready
    if (!store.services) {
        store.services = [
            {
                id: "dmv",
                name: "DMV Services",
                duration: 5
            },
            {
                id: "advising",
                name: "Student Advising",
                duration: 10
            },
            {
                id: "financial",
                name: "Financial Aid",
                duration: 8
            }
        ];
    }

    if (!store.queues) {
        store.queues = {};
    }

    function findService(serviceId) {
        return store.services.find(
            service => service.id === serviceId
        );
    }

    function getQueue(serviceId) {
        if (!store.queues[serviceId]) {
            store.queues[serviceId] = [];
        }

        return store.queues[serviceId];
    }

    function validServiceId(serviceId) {
        return typeof serviceId === "string" &&
            serviceId.length > 0 &&
            serviceId.length <= 100;
    }

    // JOIN QUEUE
    app.post("/api/queues/:serviceId/join", auth, (req, res) => {

        const { serviceId } = req.params;

        if (!validServiceId(serviceId)) {
            return fail(res, 400, "Invalid service ID.");
        }

        const service = findService(serviceId);

        if (!service) {
            return fail(res, 404, "Service not found.");
        }

        const queue = getQueue(serviceId);

        try {
            const result = joinQueue(queue, req.user.id);

            res.status(201).json({
                message: "Successfully joined queue.",
                serviceId,
                serviceName: service.name,
                userId: req.user.id,
                position: result.position,
                estimatedWait: estimateWait(
                    result.position,
                    service.duration
                ),
                status: "waiting"
            });

        } catch (error) {
            return fail(res, 409, error.message);
        }
    });

    // LEAVE QUEUE
    app.delete("/api/queues/:serviceId/leave", auth, (req, res) => {

        const { serviceId } = req.params;

        if (!validServiceId(serviceId)) {
            return fail(res, 400, "Invalid service ID.");
        }

        const service = findService(serviceId);

        if (!service) {
            return fail(res, 404, "Service not found.");
        }

        const queue = getQueue(serviceId);

        try {
            leaveQueue(queue, req.user.id);

            res.json({
                message: "Successfully left queue.",
                serviceId
            });

        } catch (error) {
            return fail(res, 404, error.message);
        }
    });

    // GET CURRENT QUEUE STATUS
    app.get("/api/queues/:serviceId/status", auth, (req, res) => {

        const { serviceId } = req.params;

        if (!validServiceId(serviceId)) {
            return fail(res, 400, "Invalid service ID.");
        }

        const service = findService(serviceId);

        if (!service) {
            return fail(res, 404, "Service not found.");
        }

        const queue = getQueue(serviceId);

        const status = getQueueStatus(
            queue,
            req.user.id,
            service.duration
        );

        if (!status) {
            return fail(res, 404, "You are not in this queue.");
        }

        res.json({
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

        const service = findService(serviceId);

        if (!service) {
            return fail(res, 404, "Service not found.");
        }

        const queue = getQueue(serviceId);

        const existingIndex = queue.findIndex(
            entry => entry.userId === req.user.id
        );

        const position = existingIndex === -1
            ? queue.length + 1
            : existingIndex + 1;

        res.json({
            serviceId,
            serviceName: service.name,
            position,
            estimatedWait: estimateWait(
                position,
                service.duration
            )
        });
    });
}

module.exports = { registerQueueRoutes };