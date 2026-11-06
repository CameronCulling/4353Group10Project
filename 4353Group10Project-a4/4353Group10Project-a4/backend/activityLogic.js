 "use strict";

const { randomUUID } = require("node:crypto");

function createActivityLogic(db) {
    function createNotification(userId, type, message) {
        const notification = { id: randomUUID(), userId, type, message };
        db.prepare(`
            INSERT INTO Notification
                (notification_id, user_id, type, message)
            VALUES (?, ?, ?, ?)
        `).run(notification.id, userId, type, message);
        return notification;
    }

    function recordJoin({ userId, serviceId, serviceName, position }) {
        const historyId = randomUUID();
        db.exec("BEGIN IMMEDIATE");
        try {
            db.prepare(`
                INSERT INTO History
                    (history_id, user_id, service_id, service_name, outcome)
                VALUES (?, ?, ?, ?, 'waiting')
            `).run(historyId, userId, serviceId, serviceName);

            createNotification(
                userId,
                "joined",
                `You joined the ${serviceName} queue at position ${position}.`
            );

            // Only users in positions one and two receive an approaching-turn alert.
            if (position <= 2) {
                createNotification(
                    userId,
                    "near-turn",
                    `You are close to your turn in the ${serviceName} queue.`
                );
            }
            db.exec("COMMIT");
            return historyId;
        } catch (error) {
            try { db.exec("ROLLBACK"); } catch {}
            throw error;
        }
    }

    function finishHistory(userId, serviceId, outcome) {
        const history = db.prepare(`
            SELECT history_id
            FROM History
            WHERE user_id = ? AND service_id = ? AND outcome = 'waiting'
            ORDER BY joined_at DESC, history_id DESC
            LIMIT 1
        `).get(userId, serviceId);

        if (!history) return null;

        db.prepare(`
            UPDATE History
            SET outcome = ?,
                ended_at = CURRENT_TIMESTAMP,
                wait_minutes = MAX(
                    0,
                    CAST(
                        (julianday(CURRENT_TIMESTAMP) -
                         julianday(joined_at)) * 1440 AS INTEGER
                    )
                )
            WHERE history_id = ?
        `).run(outcome, history.history_id);

        return history.history_id;
    }

    function finishAndNotify(userId, serviceId, serviceName, outcome, type, message) {
        db.exec("BEGIN IMMEDIATE");
        try {
            const historyId = finishHistory(userId, serviceId, outcome);
            if (historyId) createNotification(userId, type, message);
            db.exec("COMMIT");
            return historyId;
        } catch (error) {
            try { db.exec("ROLLBACK"); } catch {}
            throw error;
        }
    }

    function recordLeave(userId, serviceId, serviceName) {
        return finishAndNotify(
            userId, serviceId, serviceName, "left", "left",
            `You left the ${serviceName} queue.`
        );
    }

    function recordServed(userId, serviceId, serviceName) {
        return finishAndNotify(
            userId, serviceId, serviceName, "served", "served",
            `You have been served by ${serviceName}.`
        );
    }

    function recordCanceled(userId, serviceId, serviceName) {
        return finishAndNotify(
            userId, serviceId, serviceName, "canceled", "canceled",
            `Your ${serviceName} queue entry was canceled.`
        );
    }

    return {
        createNotification,
        recordJoin,
        recordLeave,
        recordServed,
        recordCanceled
    };
}

// Legacy in-memory helpers retained for the existing activity.test.js.
// The live application uses createActivityLogic(db) above.
function validateLegacyJoin(store, userId, service, entry) {
    if (!store || !Array.isArray(store.notifications) ||
        !Array.isArray(store.history)) throw new Error("Invalid activity store.");
    if (typeof userId !== "string" || !userId.trim()) throw new Error("Invalid user ID.");
    if (userId.length > 100) throw new Error("User ID cannot exceed 100 characters.");
    if (!service || typeof service !== "object") throw new Error("Invalid service.");
    if (typeof service.id !== "string" || !service.id.trim()) throw new Error("Invalid service ID.");
    if (service.id.length > 100) throw new Error("Service ID cannot exceed 100 characters.");
    if (typeof service.name !== "string" || !service.name.trim()) throw new Error("Invalid service name.");
    if (service.name.length > 100) throw new Error("Service name cannot exceed 100 characters.");
    if (!entry || typeof entry !== "object") throw new Error("Invalid queue entry.");
    if (typeof entry.joinedAt !== "string") {
        throw new Error("Invalid joinedAt date.");
    }
    if (entry.joinedAt.length > 40) throw new Error("joinedAt cannot exceed 40 characters.");
    if (!Number.isFinite(Date.parse(entry.joinedAt))) {
        throw new Error("Invalid joinedAt date.");
    }
}

function recordQueueJoin(store, userId, service, entry) {
    validateLegacyJoin(store, userId, service, entry);
    const history = {
        id: randomUUID(), userId, serviceId: service.id,
        serviceName: service.name, joinedAt: entry.joinedAt,
        endedAt: null, waitMinutes: null, outcome: "waiting"
    };
    store.history.push(history);
    entry.historyId = history.id;
    const notification = {
        id: randomUUID(), userId, type: "joined",
        message: `You joined the ${service.name} queue.`,
        read: false, createdAt: new Date().toISOString()
    };
    store.notifications.push(notification);
    return history;
}

function recordQueueExit(store, userId, service, entry, outcome) {
    if (!["left", "served", "canceled"].includes(outcome)) throw new Error("Outcome is invalid.");
    const history = store.history.find(item =>
        item.userId === userId &&
        item.serviceId === service.id &&
        item.outcome === "waiting" &&
        (!entry.historyId || item.id === entry.historyId)
    );
    if (!history) throw new Error("Active history not found.");
    const end = new Date();
    history.endedAt = end.toISOString();
    history.waitMinutes = Math.max(0, Math.floor((end - new Date(history.joinedAt)) / 60000));
    history.outcome = outcome;
    return history;
}

function notifyNearbyUsers(store, service, queue) {
    if (!Array.isArray(queue)) throw new Error("Invalid queue.");
    queue.slice(0, 2).forEach(entry => {
        if (entry.nearTurnNotified) return;
        store.notifications.push({
            id: randomUUID(),
            userId: entry.userId,
            type: "near-turn",
            message: `You are close to your turn in the ${service.name} queue.`,
            read: false,
            createdAt: new Date().toISOString()
        });
        entry.nearTurnNotified = true;
    });
}

module.exports = {
    createActivityLogic,
    recordQueueJoin,
    recordQueueExit,
    notifyNearbyUsers
};
