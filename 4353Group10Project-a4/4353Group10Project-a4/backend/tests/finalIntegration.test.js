"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createApp } = require("../app");
const { createDatabase } = require("../db");
const { createUserRepository } = require("../userRepository");

const adminAccount = { name: "Integration Admin", email: "admin-final@example.com", password: "TestAdmin123!" };
const customer = { name: "Integration Customer", email: "customer-final@example.com", password: "TestCustomer123!" };
const otherCustomer = { name: "Other Customer", email: "other-final@example.com", password: "TestOther123!" };

async function withServer(db, run) {
    const app = createApp({ db });
    const server = app.listen(0, "127.0.0.1");
    try {
        await once(server, "listening");
        const root = `http://127.0.0.1:${server.address().port}`;
        async function request(endpoint, { method = "GET", token, body, headers = {} } = {}) {
            const response = await fetch(root + endpoint, {
                method,
                headers: {
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
                    ...headers
                },
                body: body === undefined ? undefined : JSON.stringify(body)
            });
            const raw = await response.text();
            let data = raw;
            if ((response.headers.get("content-type") || "").includes("application/json")) {
                data = JSON.parse(raw);
            }
            return { status: response.status, data, headers: response.headers };
        }
        await run(request);
    } finally {
        await new Promise((resolve, reject) => {
            server.close(error => error ? reject(error) : resolve());
            server.closeAllConnections();
        });
    }
}

async function login(request, account) {
    const result = await request("/api/auth/login", { method: "POST", body: { email: account.email, password: account.password } });
    assert.equal(result.status, 200);
    assert.match(result.data.token, /^[a-f0-9]{64}$/);
    assert.ok(!Object.hasOwn(result.data.user, "passwordHash"));
    return result.data.token;
}

async function register(request, account) {
    const result = await request("/api/auth/register", { method: "POST", body: account });
    assert.equal(result.status, 201);
    assert.equal(result.data.user.role, "user");
    assert.ok(!Object.hasOwn(result.data.user, "passwordHash"));
    return result.data;
}

async function withMemoryDb(run) {
    const db = createDatabase(":memory:");
    try {
        createUserRepository(db).createAdmin(adminAccount);
        await withServer(db, request => run(request, db));
    } finally { db.close(); }
}

// The namespace is guarded even before teammates register report handlers.
// Admin success for the actual report is checked separately after merging.
test("admin and future report API paths reject anonymous and ordinary users", () => withMemoryDb(async request => {
    const { token } = await register(request, customer);
    const endpoints = ["/api/admin/dashboard", "/api/admin/queues", "/api/admin/reports", "/api/admin/reports/export"];
    for (const endpoint of endpoints) {
        const anonymous = await request(endpoint);
        assert.equal(anonymous.status, 401, endpoint);
        assert.equal(anonymous.headers.get("cache-control"), "no-store");
        const regular = await request(endpoint, { token });
        assert.equal(regular.status, 403, endpoint);
        assert.equal(regular.headers.get("cache-control"), "no-store");
    }
    const admin = await login(request, adminAccount);
    const dashboard = await request("/api/admin/dashboard", { token: admin });
    assert.equal(dashboard.status, 200);
    assert.equal(dashboard.headers.get("cache-control"), "no-store");
    assert.equal(typeof dashboard.data.totalServices, "number");
    assert.equal((await request("/api/services", { token })).status, 200);
}));

test("public registration cannot create an admin and forged or revoked tokens fail", () => withMemoryDb(async request => {
    const attempt = await request("/api/auth/register", { method: "POST", body: { ...customer, role: "admin" } });
    assert.equal(attempt.status, 400);
    const { token } = await register(request, customer);
    const profile = await request("/api/me", { token });
    assert.equal(profile.status, 200);
    assert.deepEqual(Object.keys(profile.data).sort(), ["email", "id", "name", "role"]);
    for (const authorization of ["Basic abc", "Bearer invalid", `Bearer ${"0".repeat(64)}`]) {
        assert.equal((await request("/api/admin/reports", { headers: { Authorization: authorization } })).status, 401);
    }
    assert.equal((await request("/api/auth/logout", { method: "POST", token })).status, 200);
    assert.equal((await request("/api/me", { token })).status, 401);
    assert.equal((await request("/api/admin/reports/export", { token })).status, 401);
}));

test("admin authorization uses the current SQLite role rather than a stale session role", () => withMemoryDb(async (request, db) => {
    const token = await login(request, adminAccount);
    assert.equal((await request("/api/admin/dashboard", { token })).status, 200);
    db.prepare("UPDATE UserCredentials SET role = 'user' WHERE email = ?").run(adminAccount.email);
    assert.equal((await request("/api/admin/dashboard", { token })).status, 403);
    db.prepare("UPDATE UserCredentials SET role = 'admin' WHERE email = ?").run(adminAccount.email);
    assert.equal((await request("/api/admin/dashboard", { token })).status, 200);
}));

test("accounts, services, queue entries, history and notifications persist across database reopen", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "queuesmart-final-"));
    const filename = path.join(dir, "integration.sqlite");
    let db;
    let oldToken, userId, serviceId;
    try {
        db = createDatabase(filename);
        createUserRepository(db).createAdmin(adminAccount);
        await withServer(db, async request => {
            const admin = await login(request, adminAccount);
            const user = await register(request, customer);
            oldToken = user.token;
            userId = user.user.id;
            const service = await request("/api/services", { method: "POST", token: admin, body: {
                name: "Final Integration Service", description: "Temporary test service", duration: 6, priority: "normal"
            } });
            assert.equal(service.status, 201);
            serviceId = service.data.id;
            const queueStatus = `/api/admin/services/${serviceId}/queue-status`;
            assert.equal((await request(queueStatus, { method: "PATCH", token: admin, body: { open: true } })).status, 200);
            assert.equal((await request(`/api/queues/${serviceId}/join`, { method: "POST", token: oldToken })).status, 201);
            const history = await request("/api/history", { token: oldToken });
            assert.ok(history.data.history.some(row => row.serviceId === serviceId && row.outcome === "waiting"));
        });
        db.close(); db = null;
        db = createDatabase(filename);
        await withServer(db, async request => {
            // Existing implementation deliberately keeps sessions in memory.
            assert.equal((await request("/api/me", { token: oldToken })).status, 401);
            const token = await login(request, customer);
            const admin = await login(request, adminAccount);
            const profile = await request("/api/me", { token });
            assert.equal(profile.data.id, userId);
            const serviceList = await request("/api/services", { token });
            assert.ok(serviceList.data.some(row => row.id === serviceId && row.open));
            const queue = await request(`/api/queues/${serviceId}/status`, { token });
            assert.equal(queue.status, 200);
            assert.equal(queue.data.position, 1);
            assert.equal((await request(`/api/admin/queues/${serviceId}/next`, { method: "DELETE", token })).status, 403);
            assert.equal((await request(`/api/admin/queues/${serviceId}/next`, { method: "DELETE", token: admin })).status, 200);
            const history = await request("/api/history", { token });
            const served = history.data.history.find(row => row.serviceId === serviceId);
            assert.equal(served.outcome, "served");
            assert.ok(served.endedAt);
            assert.ok(served.waitMinutes >= 0);
            const notices = await request("/api/notifications", { token });
            assert.ok(notices.data.notifications.some(row => row.type === "joined"));
            assert.ok(notices.data.notifications.some(row => row.type === "served"));
            const other = await register(request, otherCustomer);
            assert.deepEqual((await request("/api/history", { token: other.token })).data.history, []);
            assert.deepEqual((await request("/api/notifications", { token: other.token })).data.notifications, []);
        });
        db.close(); db = null;
        db = createDatabase(filename);
        const saved = db.prepare("SELECT outcome, ended_at FROM History WHERE user_id = ? AND service_id = ?").get(userId, serviceId);
        assert.equal(saved.outcome, "served");
        assert.ok(saved.ended_at);
        assert.equal(db.prepare("SELECT COUNT(*) AS count FROM Notification WHERE user_id = ? AND type = 'served'").get(userId).count, 1);
    } finally {
        if (db) db.close();
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
