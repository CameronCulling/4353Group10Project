const test = require("node:test");
const assert = require("node:assert/strict");

const {
  recordQueueJoin,
  recordQueueExit,
  notifyNearbyUsers
} = require("../activityLogic");

// Each test gets fresh data so tests cannot affect one another.
function setup() {
  return {
    store: {
      notifications: [],
      history: []
    },
    service: {
      id: "dmv",
      name: "DMV Services"
    },
    entry: {
      userId: "user-1",
      joinedAt: new Date(Date.now() - 5 * 60000).toISOString()
    }
  };
}

test("joining creates an unread notification and waiting history", () => {
  const { store, service, entry } = setup();

  const history = recordQueueJoin(
    store, entry.userId, service, entry
  );

  assert.equal(store.history.length, 1);
  assert.equal(history.userId, "user-1");
  assert.equal(history.serviceId, "dmv");
  assert.equal(history.outcome, "waiting");
  assert.equal(history.endedAt, null);
  assert.equal(history.waitMinutes, null);
  assert.equal(entry.historyId, history.id);

  assert.equal(store.notifications.length, 1);

  const notification = store.notifications[0];

  assert.equal(notification.userId, "user-1");
  assert.equal(notification.type, "joined");
  assert.equal(notification.read, false);
  assert.match(notification.message, /DMV Services/);
  assert.ok(notification.id);
  assert.ok(Number.isFinite(Date.parse(notification.createdAt)));
});

test("leaving updates the existing visit and calculates wait time", () => {
  const { store, service, entry } = setup();

  recordQueueJoin(store, entry.userId, service, entry);

  const history = recordQueueExit(
    store, entry.userId, service, entry, "left"
  );

  assert.equal(store.history.length, 1);
  assert.equal(history.outcome, "left");
  assert.equal(history.waitMinutes, 5);
  assert.ok(Number.isFinite(Date.parse(history.endedAt)));
});

test("being served records a served outcome", () => {
  const { store, service, entry } = setup();

  recordQueueJoin(store, entry.userId, service, entry);

  const history = recordQueueExit(
    store, entry.userId, service, entry, "served"
  );

  assert.equal(history.outcome, "served");
  assert.equal(history.waitMinutes, 5);
});

test("repeat visits have separate history records", () => {
  const { store, service, entry } = setup();

  const firstVisit = recordQueueJoin(
    store, entry.userId, service, entry
  );

  recordQueueExit(store, entry.userId, service, entry, "left");

  const secondEntry = {
    userId: "user-1",
    joinedAt: new Date().toISOString()
  };

  const secondVisit = recordQueueJoin(
    store, secondEntry.userId, service, secondEntry
  );

  assert.equal(store.history.length, 2);
  assert.notEqual(firstVisit.id, secondVisit.id);
  assert.equal(firstVisit.outcome, "left");
  assert.equal(secondVisit.outcome, "waiting");
});

test("invalid required fields and types are rejected", () => {
  const invalidCases = [
    { userId: "" },
    { userId: 123 },
    { service: null },
    { entry: null },
    { service: { id: "", name: "DMV Services" } },
    { service: { id: "dmv", name: 123 } },
    { entry: { joinedAt: "not-a-date" } },
    { entry: { joinedAt: 123 } }
  ];

  invalidCases.forEach(invalid => {
    const data = setup();

    const userId = Object.hasOwn(invalid, "userId")
      ? invalid.userId
      : data.entry.userId;

    const service = Object.hasOwn(invalid, "service")
      ? invalid.service
      : data.service;

    const entry = Object.hasOwn(invalid, "entry")
      ? invalid.entry
      : data.entry;

    assert.throws(() => {
      recordQueueJoin(data.store, userId, service, entry);
    });

    // Invalid activity must not create partial records.
    assert.equal(data.store.history.length, 0);
    assert.equal(data.store.notifications.length, 0);
  });
});

test("field length limits are enforced", () => {
  const cases = [
    {
      userId: "x".repeat(101),
      service: { id: "dmv", name: "DMV Services" }
    },
    {
      userId: "user-1",
      service: { id: "x".repeat(101), name: "DMV Services" }
    },
    {
      userId: "user-1",
      service: { id: "dmv", name: "x".repeat(101) }
    }
  ];

  cases.forEach(item => {
    const { store, entry } = setup();

    assert.throws(
      () => recordQueueJoin(
        store, item.userId, item.service, entry
      ),
      /cannot exceed/
    );

    assert.equal(store.history.length, 0);
  });

  const { store, service } = setup();

  assert.throws(
    () => recordQueueJoin(store, "user-1", service, {
      joinedAt: "x".repeat(41)
    }),
    /cannot exceed/
  );
});

test("invalid outcomes do not change active history", () => {
  const { store, service, entry } = setup();

  const history = recordQueueJoin(
    store, entry.userId, service, entry
  );

  assert.throws(
    () => recordQueueExit(
      store, entry.userId, service, entry, "cancelled"
    ),
    /Outcome/
  );

  assert.equal(history.outcome, "waiting");
  assert.equal(history.endedAt, null);
});

test("missing history and repeated exits are rejected", () => {
  const { store, service, entry } = setup();

  assert.throws(
    () => recordQueueExit(
      store, entry.userId, service, entry, "left"
    ),
    /Active history/
  );

  recordQueueJoin(store, entry.userId, service, entry);
  recordQueueExit(store, entry.userId, service, entry, "left");

  assert.throws(
    () => recordQueueExit(
      store, entry.userId, service, entry, "served"
    ),
    /Active history/
  );

  assert.equal(store.history[0].outcome, "left");
});

test("another user cannot complete someone else's history", () => {
  const { store, service, entry } = setup();

  recordQueueJoin(store, entry.userId, service, entry);

  assert.throws(
    () => recordQueueExit(
      store, "user-2", service, entry, "left"
    ),
    /Active history/
  );

  assert.equal(store.history[0].outcome, "waiting");
});

test("only the first two users receive approaching-turn alerts", () => {
  const { store, service } = setup();

  const queue = [
    { userId: "user-1" },
    { userId: "user-2" },
    { userId: "user-3" }
  ];

  notifyNearbyUsers(store, service, queue);

  assert.deepEqual(
    store.notifications.map(item => item.userId),
    ["user-1", "user-2"]
  );

  assert.ok(
    store.notifications.every(item => item.type === "near-turn")
  );

  assert.equal(queue[2].nearTurnNotified, undefined);
});

test("approaching-turn alerts are not duplicated", () => {
  const { store, service } = setup();

  const queue = [
    { userId: "user-1" },
    { userId: "user-2" },
    { userId: "user-3" }
  ];

  notifyNearbyUsers(store, service, queue);
  notifyNearbyUsers(store, service, queue);

  assert.equal(store.notifications.length, 2);

  // Once the first person leaves, the third person moves into the top two.
  queue.shift();
  notifyNearbyUsers(store, service, queue);

  assert.equal(store.notifications.length, 3);
  assert.equal(store.notifications[2].userId, "user-3");
});

test("an empty queue creates no approaching-turn notifications", () => {
  const { store, service } = setup();

  notifyNearbyUsers(store, service, []);

  assert.equal(store.notifications.length, 0);
});