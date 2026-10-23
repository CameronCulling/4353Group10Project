"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createApp } = require("../app");

/*
==========================================
TEST SERVER SETUP
==========================================
*/

async function withServer(run) {
    const server = createApp().listen(0);

    await new Promise(resolve => {
        server.once("listening", resolve);
    });

    const root = `http://127.0.0.1:${server.address().port}`;

    async function request(path, method = "GET", body, token) {
        const headers = {};

        if (body !== undefined) {
            headers["Content-Type"] = "application/json";
        }

        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }

        const response = await fetch(root + path, {
            method,
            headers,
            ...(body !== undefined
                ? { body: JSON.stringify(body) }
                : {})
        });

        return {
            status: response.status,
            data: await response.json().catch(() => null)
        };
    }

    try {
        await run(request);
    } finally {
        await new Promise((resolve, reject) => {
            server.close(error => {
                if (error) reject(error);
                else resolve();
            });
        });
    }
}

/*
==========================================
AUTHENTICATION HELPERS
==========================================
*/

async function loginAdmin(request) {
    const result = await request(
        "/api/auth/login",
        "POST",
        {
            email: "admin@queuesmart.local",
            password: "Admin12345!"
        }
    );

    assert.equal(result.status, 200);
    assert.ok(result.data.token);

    return result.data.token;
}

async function registerUser(request) {
    const result = await request(
        "/api/auth/register",
        "POST",
        {
            name: "Test User",
            email: "test@example.com",
            password: "SecurePass123!"
        }
    );

    assert.equal(result.status, 201);
    assert.ok(result.data.token);

    return result.data.token;
}

/*
==========================================
SERVICE HELPER
==========================================
*/

async function createTestService(request, token) {
    const result = await request(
        "/api/services",
        "POST",
        {
            name: "Admin Test Service",
            description: "Service used for admin testing.",
            duration: 15,
            priority: "medium"
        },
        token
    );

    assert.equal(result.status, 201);
    assert.ok(result.data.id);

    return result.data;
}

/*
==========================================
DASHBOARD TESTS
==========================================
*/

test("Admin can view dashboard statistics", () =>
    withServer(async request => {

        const token = await loginAdmin(request);

        const result = await request(
            "/api/admin/dashboard",
            "GET",
            undefined,
            token
        );

        assert.equal(result.status, 200);

        assert.equal(
            typeof result.data.totalServices,
            "number"
        );

        assert.equal(
            typeof result.data.openQueues,
            "number"
        );

        assert.equal(
            typeof result.data.peopleWaiting,
            "number"
        );

        assert.ok(result.data.totalServices >= 0);
        assert.ok(result.data.openQueues >= 0);
        assert.ok(result.data.peopleWaiting >= 0);
    })
);

test("Dashboard requires authentication", () =>
    withServer(async request => {

        const result = await request(
            "/api/admin/dashboard"
        );

        assert.equal(result.status, 401);
    })
);

test("Regular users cannot view admin dashboard", () =>
    withServer(async request => {

        const token = await registerUser(request);

        const result = await request(
            "/api/admin/dashboard",
            "GET",
            undefined,
            token
        );

        assert.equal(result.status, 403);
    })
);

/*
==========================================
VIEW QUEUES TESTS
==========================================
*/

test("Admin can retrieve queue summaries", () =>
    withServer(async request => {

        const token = await loginAdmin(request);

        const result = await request(
            "/api/admin/queues",
            "GET",
            undefined,
            token
        );

        assert.equal(result.status, 200);
        assert.ok(Array.isArray(result.data));

        for (const summary of result.data) {
            assert.equal(
                typeof summary.serviceId,
                "string"
            );

            assert.equal(
                typeof summary.count,
                "number"
            );

            assert.ok(Array.isArray(summary.waiting));

            assert.equal(
                summary.count,
                summary.waiting.length
            );
        }
    })
);

test("Queue summaries include newly created services", () =>
    withServer(async request => {

        const token = await loginAdmin(request);

        const service = await createTestService(
            request,
            token
        );

        const result = await request(
            "/api/admin/queues",
            "GET",
            undefined,
            token
        );

        assert.equal(result.status, 200);

        const summary = result.data.find(
            item => item.serviceId === service.id
        );

        assert.ok(summary);
        assert.equal(summary.count, 0);
        assert.deepEqual(summary.waiting, []);
    })
);

test("Regular users cannot view admin queues", () =>
    withServer(async request => {

        const token = await registerUser(request);

        const result = await request(
            "/api/admin/queues",
            "GET",
            undefined,
            token
        );

        assert.equal(result.status, 403);
    })
);

test("Unauthenticated users cannot view admin queues", () =>
    withServer(async request => {

        const result = await request(
            "/api/admin/queues"
        );

        assert.equal(result.status, 401);
    })
);

/*
==========================================
SERVE NEXT TESTS
==========================================
*/

test("Serving an empty queue returns 409", () =>
    withServer(async request => {

        const token = await loginAdmin(request);

        const service = await createTestService(
            request,
            token
        );

        const result = await request(
            `/api/admin/queues/${service.id}/next`,
            "DELETE",
            undefined,
            token
        );

        assert.equal(result.status, 409);
    })
);

test("Serving a nonexistent service returns 404", () =>
    withServer(async request => {

        const token = await loginAdmin(request);

        const result = await request(
            "/api/admin/queues/nonexistent/next",
            "DELETE",
            undefined,
            token
        );

        assert.equal(result.status, 404);
    })
);

test("Regular users cannot serve the next person", () =>
    withServer(async request => {

        const token = await registerUser(request);

        const result = await request(
            "/api/admin/queues/dmv/next",
            "DELETE",
            undefined,
            token
        );

        assert.equal(result.status, 403);
    })
);

/*
==========================================
REMOVE USER TESTS
==========================================
*/

test("Removing a nonexistent user returns 404", () =>
    withServer(async request => {

        const token = await loginAdmin(request);

        const service = await createTestService(
            request,
            token
        );

        const result = await request(
            `/api/admin/queues/${service.id}/users/fake-user`,
            "DELETE",
            undefined,
            token
        );

        assert.equal(result.status, 404);
    })
);

test("Removing from a nonexistent service returns 404", () =>
    withServer(async request => {

        const token = await loginAdmin(request);

        const result = await request(
            "/api/admin/queues/nonexistent/users/fake-user",
            "DELETE",
            undefined,
            token
        );

        assert.equal(result.status, 404);
    })
);

test("Regular users cannot remove queue members", () =>
    withServer(async request => {

        const token = await registerUser(request);

        const result = await request(
            "/api/admin/queues/dmv/users/some-user",
            "DELETE",
            undefined,
            token
        );

        assert.equal(result.status, 403);
    })
);

/*
==========================================
OPEN / CLOSE QUEUE TESTS
==========================================
*/

test("Admin can open a queue", () =>
    withServer(async request => {

        const token = await loginAdmin(request);

        const service = await createTestService(
            request,
            token
        );

        const result = await request(
            `/api/admin/services/${service.id}/queue-status`,
            "PATCH",
            { open: true },
            token
        );

        assert.equal(result.status, 200);
        assert.equal(result.data.service.open, true);
    })
);

test("Admin can close a queue", () =>
    withServer(async request => {

        const token = await loginAdmin(request);

        const service = await createTestService(
            request,
            token
        );

        const result = await request(
            `/api/admin/services/${service.id}/queue-status`,
            "PATCH",
            { open: false },
            token
        );

        assert.equal(result.status, 200);
        assert.equal(result.data.service.open, false);
    })
);

test("Queue status changes appear in dashboard statistics", () =>
    withServer(async request => {

        const token = await loginAdmin(request);

        const service = await createTestService(
            request,
            token
        );

        // Ensure the new service is initially closed.
        await request(
            `/api/admin/services/${service.id}/queue-status`,
            "PATCH",
            { open: false },
            token
        );

        const before = await request(
            "/api/admin/dashboard",
            "GET",
            undefined,
            token
        );

        // Open the queue.
        const opened = await request(
            `/api/admin/services/${service.id}/queue-status`,
            "PATCH",
            { open: true },
            token
        );

        assert.equal(opened.status, 200);

        const after = await request(
            "/api/admin/dashboard",
            "GET",
            undefined,
            token
        );

        assert.equal(
            after.data.openQueues,
            before.data.openQueues + 1
        );
    })
);

test("Queue status must be a boolean", () =>
    withServer(async request => {

        const token = await loginAdmin(request);

        const service = await createTestService(
            request,
            token
        );

        const result = await request(
            `/api/admin/services/${service.id}/queue-status`,
            "PATCH",
            { open: "yes" },
            token
        );

        assert.equal(result.status, 400);
    })
);

test("Missing queue status returns 400", () =>
    withServer(async request => {

        const token = await loginAdmin(request);

        const service = await createTestService(
            request,
            token
        );

        const result = await request(
            `/api/admin/services/${service.id}/queue-status`,
            "PATCH",
            {},
            token
        );

        assert.equal(result.status, 400);
    })
);

test("Regular users cannot change queue status", () =>
    withServer(async request => {

        const token = await registerUser(request);

        const result = await request(
            "/api/admin/services/dmv/queue-status",
            "PATCH",
            { open: false },
            token
        );

        assert.equal(result.status, 403);
    })
);

test("Changing a nonexistent service returns 404", () =>
    withServer(async request => {

        const token = await loginAdmin(request);

        const result = await request(
            "/api/admin/services/nonexistent/queue-status",
            "PATCH",
            { open: true },
            token
        );

        assert.equal(result.status, 404);
    })
);