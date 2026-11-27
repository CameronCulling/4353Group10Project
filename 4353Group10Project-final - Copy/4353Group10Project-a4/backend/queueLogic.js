 "use strict";

function estimateWait(position, duration) {
    if (!Number.isInteger(position) || position < 1) {
        throw new Error("Invalid queue position.");
    }
    if (
        typeof duration !== "number" ||
        !Number.isFinite(duration) ||
        duration <= 0
    ) {
        throw new Error("Invalid service duration.");
    }
    return (position - 1) * duration;
}

function validUserId(userId) {
    return typeof userId === "string" &&
        userId.trim().length > 0 &&
        userId.length <= 100;
}

function validServiceId(serviceId) {
    return typeof serviceId === "string" &&
        serviceId.trim().length > 0 &&
        serviceId.length <= 100;
}

// Backward-compatible array helpers retained for the original unit tests.
// Production API routes use queueRepository.js and SQLite instead.
function joinQueue(queue, userId) {
    if (!Array.isArray(queue)) throw new Error("Invalid queue.");
    if (!validUserId(userId)) throw new Error("Invalid user ID.");
    if (queue.some(entry => entry.userId === userId)) {
        throw new Error("User is already in this queue.");
    }
    const entry = { userId, position: queue.length + 1 };
    queue.push(entry);
    return entry;
}

function leaveQueue(queue, userId) {
    if (!Array.isArray(queue)) throw new Error("Invalid queue.");
    const index = queue.findIndex(entry => entry.userId === userId);
    if (index < 0) throw new Error("User is not in this queue.");
    const [removed] = queue.splice(index, 1);
    queue.forEach((entry, i) => { entry.position = i + 1; });
    return removed;
}

function getQueueStatus(queue, userId, duration) {
    if (!Array.isArray(queue)) return null;
    const entry = queue.find(item => item.userId === userId);
    if (!entry) return null;
    return {
        userId,
        position: entry.position,
        estimatedWait: estimateWait(entry.position, duration)
    };
}

module.exports = {
    estimateWait,
    validUserId,
    validServiceId,
    joinQueue,
    leaveQueue,
    getQueueStatus
};
