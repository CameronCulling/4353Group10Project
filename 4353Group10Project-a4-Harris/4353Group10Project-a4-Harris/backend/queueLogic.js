
"use strict";

// Calculate estimated wait time based on queue position.
// Position 1 has no one ahead of it, so the wait is 0.
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

// Validate a user ID before performing queue operations.
function validUserId(userId) {
    return typeof userId === "string" &&
        userId.trim().length > 0 &&
        userId.length <= 100;
}

// Validate a service ID.
function validServiceId(serviceId) {
    return typeof serviceId === "string" &&
        serviceId.trim().length > 0 &&
        serviceId.length <= 100;
}

module.exports = {
    estimateWait,
    validUserId,
    validServiceId
};
