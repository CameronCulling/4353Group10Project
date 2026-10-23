const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { createApp } = require("../app");

// Start a fresh server and in-memory store for each test.
async function withServer(run) {
  const server = createApp().listen(0, "127.0.0.1");

  try {
    await once(server, "listening");

    const base = `http://127.0.0.1:${server.address().port}`;

    async function request(path, method = "GET", token, body) {
      const headers = {};

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      if (body !== undefined) {
        headers["Content-Type"] = "application/json";
      }

      const response = await fetch(base + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
      });

      return {
        status: response.status,
        data: await response.json()
      };
    }

    async function register(number) {
      const result = await request(
        "/api/auth/register",
        "POST",
        undefined,
        {
          name: `User ${number}`,
          email: `user${number}@example.com`,
          password: "SecurePass123!"
        }
      );

      assert.equal(result.status, 201);
      return result.data.token;
    }

    await run({ request, register });
  } finally {
    await new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
  }
}

test("activity APIs require login", () =>
  withServer(async ({ request }) => {
    const endpoints = [
      ["/api/notifications", "GET"],
      ["/api/history", "GET"],
      ["/api/notifications/read-all", "PATCH"],
      ["/api/notifications/example-id", "PATCH"]
    ];

    for (const [path, method] of endpoints) {
      const result = await request(path, method);
      assert.equal(result.status, 401);
    }
  })
);

test("new users have empty notifications and history", () =>
  withServer(async ({ request, register }) => {
    const token = await register(1);

    const notifications = await request(
      "/api/notifications", "GET", token
    );

    assert.equal(notifications.status, 200);
    assert.deepEqual(notifications.data.notifications, []);
    assert.equal(notifications.data.unreadCount, 0);

    const history = await request("/api/history", "GET", token);

    assert.equal(history.status, 200);
    assert.deepEqual(history.data.history, []);
  })
);

test("joining and leaving create and update API activity", () =>
  withServer(async ({ request, register }) => {
    const token = await register(1);

    const joined = await request(
      "/api/queues/dmv/join", "POST", token
    );

    assert.equal(joined.status, 201);

    const notifications = await request(
      "/api/notifications", "GET", token
    );

    assert.equal(notifications.status, 200);
    assert.equal(notifications.data.notifications.length, 2);
    assert.equal(notifications.data.unreadCount, 2);

    assert.deepEqual(
      notifications.data.notifications.map(item => item.type).sort(),
      ["joined", "near-turn"]
    );

    const before = await request("/api/history", "GET", token);

    assert.equal(before.status, 200);
    assert.equal(before.data.history.length, 1);
    assert.equal(before.data.history[0].outcome, "waiting");

    const left = await request(
      "/api/queues/dmv/leave", "DELETE", token
    );

    assert.equal(left.status, 200);

    const after = await request("/api/history", "GET", token);

    assert.equal(after.data.history.length, 1);
    assert.equal(after.data.history[0].outcome, "left");
    assert.ok(after.data.history[0].endedAt);
    assert.ok(after.data.history[0].waitMinutes >= 0);
  })
);

test("users can mark a notification read and unread", () =>
  withServer(async ({ request, register }) => {
    const token = await register(1);

    await request("/api/queues/dmv/join", "POST", token);

    const list = await request("/api/notifications", "GET", token);
    const id = list.data.notifications[0].id;

    const read = await request(
      `/api/notifications/${id}`, "PATCH", token, { read: true }
    );

    assert.equal(read.status, 200);
    assert.equal(read.data.read, true);

    const updated = await request(
      "/api/notifications", "GET", token
    );

    assert.equal(updated.data.unreadCount, 1);

    const unread = await request(
      `/api/notifications/${id}`, "PATCH", token, { read: false }
    );

    assert.equal(unread.status, 200);
    assert.equal(unread.data.read, false);

    const restored = await request(
      "/api/notifications", "GET", token
    );

    assert.equal(restored.data.unreadCount, 2);
  })
);

test("users cannot view or modify another user's activity", () =>
  withServer(async ({ request, register }) => {
    const first = await register(1);
    const second = await register(2);

    await request("/api/queues/dmv/join", "POST", first);

    const firstList = await request(
      "/api/notifications", "GET", first
    );
    const id = firstList.data.notifications[0].id;

    const secondList = await request(
      "/api/notifications", "GET", second
    );
    const secondHistory = await request(
      "/api/history", "GET", second
    );

    assert.deepEqual(secondList.data.notifications, []);
    assert.deepEqual(secondHistory.data.history, []);

    const forbidden = await request(
      `/api/notifications/${id}`, "PATCH", second, { read: true }
    );

    assert.equal(forbidden.status, 404);

    await request("/api/notifications/read-all", "PATCH", second);

    const unchanged = await request(
      "/api/notifications", "GET", first
    );

    assert.equal(unchanged.data.unreadCount, 2);
  })
);

test("mark all as read updates only unread messages", () =>
  withServer(async ({ request, register }) => {
    const token = await register(1);

    await request("/api/queues/dmv/join", "POST", token);

    const first = await request(
      "/api/notifications/read-all", "PATCH", token
    );

    assert.equal(first.status, 200);
    assert.equal(first.data.updatedCount, 2);

    const list = await request("/api/notifications", "GET", token);

    assert.equal(list.data.unreadCount, 0);
    assert.ok(list.data.notifications.every(item => item.read));

    const repeated = await request(
      "/api/notifications/read-all", "PATCH", token
    );

    assert.equal(repeated.data.updatedCount, 0);
  })
);

test("notification updates validate body types and ID length", () =>
  withServer(async ({ request, register }) => {
    const token = await register(1);

    await request("/api/queues/dmv/join", "POST", token);

    const list = await request("/api/notifications", "GET", token);
    const id = list.data.notifications[0].id;

    for (const body of [
      {},
      [],
      { read: "true" },
      { read: 1 },
      { read: null }
    ]) {
      const result = await request(
        `/api/notifications/${id}`, "PATCH", token, body
      );

      assert.equal(result.status, 400);
    }

    const missingBody = await request(
      `/api/notifications/${id}`, "PATCH", token
    );

    assert.equal(missingBody.status, 400);

    const longId = await request(
      `/api/notifications/${"x".repeat(101)}`,
      "PATCH",
      token,
      { read: true }
    );

    assert.equal(longId.status, 400);

    const unknown = await request(
      "/api/notifications/unknown",
      "PATCH",
      token,
      { read: true }
    );

    assert.equal(unknown.status, 404);

    const unchanged = await request(
      "/api/notifications", "GET", token
    );

    assert.equal(unchanged.data.unreadCount, 2);
  })
);