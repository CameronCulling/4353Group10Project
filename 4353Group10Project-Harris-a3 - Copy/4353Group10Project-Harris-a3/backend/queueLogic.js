function estimateWait(position, duration) {
    if (!Number.isInteger(position) || position < 1) {
        throw new Error("Invalid queue position.");
    }

    if (typeof duration !== "number" ||
        !Number.isFinite(duration) || duration <= 0) {
        throw new Error("Invalid service duration.");
    }

    return (position - 1) * duration;
}

function joinQueue(queue, userId) {
    if (typeof userId !== "string" ||
        userId.trim().length === 0 ||
        userId.length > 100) {
        throw new Error("Invalid user ID.");
    }

    if (queue.some(entry => entry.userId === userId)) {
        throw new Error("User is already in this queue.");
    }

    const entry = {
        userId,
        joinedAt: new Date().toISOString()
    };

    queue.push(entry);

    return {
        ...entry,
        position: queue.length
    };
}

function leaveQueue(queue, userId) {
    const index = queue.findIndex(
        entry => entry.userId === userId
    );

    if (index === -1) {
        throw new Error("User is not in this queue.");
    }

    const removed = queue.splice(index, 1)[0];

    return removed;
}

function getQueueStatus(queue, userId, duration) {
    const index = queue.findIndex(
        entry => entry.userId === userId
    );

    if (index === -1) {
        return null;
    }

    const position = index + 1;

    return {
        userId,
        position,
        estimatedWait: estimateWait(position, duration),
        status: "waiting"
    };
}

module.exports = {
    estimateWait,
    joinQueue,
    leaveQueue,
    getQueueStatus
};
