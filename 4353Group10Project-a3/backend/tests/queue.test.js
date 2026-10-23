const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
    estimateWait,
    joinQueue,
    leaveQueue,
    getQueueStatus
} = require("../queueLogic");

test("First person has zero estimated wait", () => {
    assert.equal(estimateWait(1, 10), 0);
});

test("Wait time increases with position", () => {
    assert.equal(estimateWait(4, 10), 30);
});

test("Different services have different wait times", () => {
    assert.equal(estimateWait(3, 5), 10);
    assert.equal(estimateWait(3, 10), 20);
});

test("Invalid position is rejected", () => {
    assert.throws(
        () => estimateWait(0, 10),
        /Invalid queue position/
    );
});

test("Invalid duration is rejected", () => {
    assert.throws(
        () => estimateWait(2, -5),
        /Invalid service duration/
    );
});

test("User can join queue", () => {
    const queue = [];

    const result = joinQueue(queue, "user1");

    assert.equal(result.position, 1);
    assert.equal(queue.length, 1);
});

test("Multiple users join in arrival order", () => {
    const queue = [];

    joinQueue(queue, "user1");
    joinQueue(queue, "user2");

    assert.equal(queue[0].userId, "user1");
    assert.equal(queue[1].userId, "user2");
});

test("Duplicate users cannot join", () => {
    const queue = [];

    joinQueue(queue, "user1");

    assert.throws(
        () => joinQueue(queue, "user1"),
        /already in this queue/
    );
});

test("Invalid user ID is rejected", () => {
    const queue = [];

    assert.throws(
        () => joinQueue(queue, ""),
        /Invalid user ID/
    );
});

test("User can leave queue", () => {
    const queue = [];

    joinQueue(queue, "user1");

    leaveQueue(queue, "user1");

    assert.equal(queue.length, 0);
});

test("Leaving queue updates positions", () => {
    const queue = [];

    joinQueue(queue, "user1");
    joinQueue(queue, "user2");
    joinQueue(queue, "user3");

    leaveQueue(queue, "user1");

    const status = getQueueStatus(
        queue,
        "user3",
        10
    );

    assert.equal(status.position, 2);
    assert.equal(status.estimatedWait, 10);
});

test("Cannot leave queue if not enrolled", () => {
    const queue = [];

    assert.throws(
        () => leaveQueue(queue, "user1"),
        /not in this queue/
    );
});

test("Queue status returns null for absent user", () => {
    const queue = [];

    assert.equal(
        getQueueStatus(queue, "user1", 10),
        null
    );
});