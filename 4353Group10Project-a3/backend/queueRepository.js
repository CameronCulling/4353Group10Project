
"use strict";

const { randomUUID } = require("node:crypto");
const {
    estimateWait,
    validUserId,
    validServiceId
} = require("./queueLogic");

function createQueueRepository(db) {

    // Find a service using its database ID.
    function findService(serviceId) {
        if (!validServiceId(serviceId)) {
            return null;
        }

        return db.prepare(`
            SELECT
                service_id AS id,
                service_name AS name,
                description,
                expected_duration AS duration,
                priority_level AS priority
            FROM Service
            WHERE service_id = ?
        `).get(serviceId) || null;
    }

    // Find the currently open queue for a service.
    function findOpenQueue(serviceId) {
        return db.prepare(`
            SELECT
                queue_id AS id,
                service_id AS serviceId,
                status
            FROM Queue
            WHERE service_id = ?
              AND status = 'open'
            ORDER BY created_date DESC
            LIMIT 1
        `).get(serviceId) || null;
    }

    // Get all users currently waiting in a queue.
    function getQueueEntries(queueId) {
        return db.prepare(`
            SELECT
                entry_id AS entryId,
                queue_id AS queueId,
                user_id AS userId,
                position,
                join_time AS joinedAt,
                status
            FROM QueueEntry
            WHERE queue_id = ?
              AND status = 'waiting'
            ORDER BY position ASC, join_time ASC
        `).all(queueId);
    }

    // JOIN QUEUE
    function joinQueue(serviceId, userId) {
        if (!validServiceId(serviceId)) {
            throw new Error("Invalid service ID.");
        }

        if (!validUserId(userId)) {
            throw new Error("Invalid user ID.");
        }

        const service = findService(serviceId);

        if (!service) {
            throw new Error("Service not found.");
        }

        db.exec("BEGIN IMMEDIATE");

        try {
            const queue = findOpenQueue(serviceId);

            if (!queue) {
                throw new Error("This service is currently closed.");
            }

            // Check whether the user already has an active entry.
            const existing = db.prepare(`
                SELECT entry_id
                FROM QueueEntry
                WHERE queue_id = ?
                  AND user_id = ?
                  AND status = 'waiting'
            `).get(queue.id, userId);

            if (existing) {
                throw new Error("User is already in this queue.");
            }

            // Find the next available position.
            const result = db.prepare(`
                SELECT COALESCE(MAX(position), 0) + 1 AS nextPosition
                FROM QueueEntry
                WHERE queue_id = ?
                  AND status = 'waiting'
            `).get(queue.id);

            const position = result.nextPosition;
            const entryId = randomUUID();

            // Save the new queue entry.
            db.prepare(`
                INSERT INTO QueueEntry (
                    entry_id,
                    queue_id,
                    user_id,
                    position,
                    status
                )
                VALUES (?, ?, ?, ?, 'waiting')
            `).run(
                entryId,
                queue.id,
                userId,
                position
            );

            const entry = db.prepare(`
                SELECT
                    entry_id AS entryId,
                    queue_id AS queueId,
                    user_id AS userId,
                    position,
                    join_time AS joinedAt,
                    status
                FROM QueueEntry
                WHERE entry_id = ?
            `).get(entryId);

            db.exec("COMMIT");

            return {
                ...entry,
                serviceId
            };

        } catch (error) {
            db.exec("ROLLBACK");
            throw error;
        }
    }

    // LEAVE QUEUE
    function leaveQueue(serviceId, userId) {
        if (!validServiceId(serviceId)) {
            throw new Error("Invalid service ID.");
        }

        if (!validUserId(userId)) {
            throw new Error("Invalid user ID.");
        }

        db.exec("BEGIN IMMEDIATE");

        try {
            // Find the user's active queue entry.
            // This also allows leaving if an administrator has closed
            // the queue after the user joined.
            const queue = db.prepare(`
                SELECT
                    q.queue_id AS id,
                    q.service_id AS serviceId
                FROM Queue q
                JOIN QueueEntry e ON e.queue_id = q.queue_id
                WHERE q.service_id = ?
                  AND e.user_id = ?
                  AND e.status = 'waiting'
                ORDER BY q.created_date DESC
                LIMIT 1
            `).get(serviceId, userId);

            if (!queue) {
                throw new Error("User is not in this queue.");
            }

            const entry = db.prepare(`
                SELECT
                    entry_id AS entryId,
                    queue_id AS queueId,
                    user_id AS userId,
                    position,
                    join_time AS joinedAt,
                    status
                FROM QueueEntry
                WHERE queue_id = ?
                  AND user_id = ?
                  AND status = 'waiting'
            `).get(queue.id, userId);

            // Mark the entry as canceled instead of deleting it.
            db.prepare(`
                UPDATE QueueEntry
                SET status = 'canceled'
                WHERE entry_id = ?
            `).run(entry.entryId);

            // Reassign positions to the remaining waiting users.
            // This closes the gap left by the departing user.
            const remaining = getQueueEntries(queue.id);

            const updatePosition = db.prepare(`
                UPDATE QueueEntry
                SET position = ?
                WHERE entry_id = ?
            `);

            remaining.forEach((item, index) => {
                updatePosition.run(index + 1, item.entryId);
            });

            db.exec("COMMIT");

            return entry;

        } catch (error) {
            db.exec("ROLLBACK");
            throw error;
        }
    }

    // GET A USER'S CURRENT QUEUE STATUS
    function getQueueStatus(serviceId, userId) {
        if (!validServiceId(serviceId) || !validUserId(userId)) {
            return null;
        }

        const service = findService(serviceId);

        if (!service) {
            return null;
        }

        // Look for the user's waiting entry, including a queue
        // that may have been closed after they joined.
        const entry = db.prepare(`
            SELECT
                e.entry_id AS entryId,
                e.user_id AS userId,
                e.position,
                e.status
            FROM QueueEntry e
            JOIN Queue q ON e.queue_id = q.queue_id
            WHERE q.service_id = ?
              AND e.user_id = ?
              AND e.status = 'waiting'
            ORDER BY q.created_date DESC
            LIMIT 1
        `).get(serviceId, userId);

        if (!entry) {
            return null;
        }

        return {
            userId,
            position: entry.position,
            estimatedWait: estimateWait(
                entry.position,
                service.duration
            ),
            status: "waiting"
        };
    }

    // ESTIMATE WAIT BEFORE JOINING
    function getEstimatedPosition(serviceId, userId) {
        if (!validServiceId(serviceId) || !validUserId(userId)) {
            return null;
        }

        const service = findService(serviceId);

        if (!service) {
            return null;
        }

        const queue = findOpenQueue(serviceId);

        if (!queue) {
            return null;
        }

        // If the user already joined, return their actual position.
        const existing = db.prepare(`
            SELECT position
            FROM QueueEntry
            WHERE queue_id = ?
              AND user_id = ?
              AND status = 'waiting'
        `).get(queue.id, userId);

        if (existing) {
            return {
                position: existing.position,
                estimatedWait: estimateWait(
                    existing.position,
                    service.duration
                )
            };
        }

        // Otherwise, estimate the position they would receive.
        const result = db.prepare(`
            SELECT COUNT(*) AS total
            FROM QueueEntry
            WHERE queue_id = ?
              AND status = 'waiting'
        `).get(queue.id);

        const position = result.total + 1;

        return {
            position,
            estimatedWait: estimateWait(
                position,
                service.duration
            )
        };
    }

    return {
        findService,
        findOpenQueue,
        getQueueEntries,
        joinQueue,
        leaveQueue,
        getQueueStatus,
        getEstimatedPosition
    };
}

module.exports = { createQueueRepository };
