const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createTestApp } = require("./testHelpers");

async function withServer(run) {
    const { app, db } = createTestApp();
    const server = app.listen(0);
    await new Promise(resolve => server.once("listening", resolve));
    const root = `http://127.0.0.1:${server.address().port}`;

    async function request(path, method = "GET", body, token) {
        const headers = {};
        if (body !== undefined) headers["Content-Type"] = "application/json";
        if (token) headers.Authorization = `Bearer ${token}`;
        const response = await fetch(root + path, {
            method, headers,
            ...(body !== undefined ? { body: JSON.stringify(body) } : {})
        });
        const contentType = response.headers.get("content-type") || "";
        return {
            status: response.status,
            headers: response.headers,
            data: contentType.includes("application/json")
                ? await response.json()
                : await response.text()
        };
    }

    try { await run(request); }
    finally {
        await new Promise(resolve => server.close(resolve));
        db.close();
    }
}

async function loginAdmin(request) {
    const result = await request("/api/auth/login", "POST", {
        email: "admin@queuesmart.local", password: "Admin12345!"
    });
    assert.equal(result.status, 200);
    return result.data.token;
}

async function registerUser(request, email = "report-user@example.com") {
    const result = await request("/api/auth/register", "POST", {
        name: "Report Test User", email, password: "SecurePass123!"
    });
    assert.equal(result.status, 201);
    return result.data.token;
}

test("report endpoints require authentication", () => withServer(async request => {
    for (const path of [
        "/api/admin/reports/overview",
        "/api/admin/reports/users",
        "/api/admin/reports/services",
        "/api/admin/reports/export?type=users"
    ]) {
        const result = await request(path);
        assert.equal(result.status, 401);
    }
}));

test("regular users cannot access administrator reports", () => withServer(async request => {
    const token = await registerUser(request);
    const result = await request("/api/admin/reports/overview", "GET", undefined, token);
    assert.equal(result.status, 403);
}));

test("admin can retrieve overview, user, and service reports", () => withServer(async request => {
    const adminToken = await loginAdmin(request);
    const userToken = await registerUser(request);
    const joined = await request("/api/queues/dmv/join", "POST", {}, userToken);
    assert.equal(joined.status, 201);

    const overview = await request("/api/admin/reports/overview", "GET", undefined, adminToken);
    assert.equal(overview.status, 200);
    assert.ok(overview.data.totalEntries >= 1);
    assert.ok(overview.data.currentlyWaiting >= 1);

    const users = await request("/api/admin/reports/users", "GET", undefined, adminToken);
    assert.equal(users.status, 200);
    assert.ok(users.data.some(row => row.email === "report-user@example.com"));
    assert.ok(users.data.some(row => row.outcome === "waiting"));

    const services = await request("/api/admin/reports/services", "GET", undefined, adminToken);
    assert.equal(services.status, 200);
    const dmv = services.data.find(row => row.serviceId === "dmv");
    assert.ok(dmv);
    assert.ok(dmv.totalEntries >= 1);
    assert.ok(dmv.currentlyWaiting >= 1);
}));

test("report filters support service and valid date ranges", () => withServer(async request => {
    const adminToken = await loginAdmin(request);
    const userToken = await registerUser(request);
    await request("/api/queues/dmv/join", "POST", {}, userToken);

    const filtered = await request(
        "/api/admin/reports/users?serviceId=dmv&startDate=2000-01-01&endDate=2099-12-31",
        "GET", undefined, adminToken
    );
    assert.equal(filtered.status, 200);
    assert.ok(filtered.data.length >= 1);
    assert.ok(filtered.data.every(row => row.serviceId === "dmv"));

    const invalid = await request(
        "/api/admin/reports/users?startDate=2026-99-99",
        "GET", undefined, adminToken
    );
    assert.equal(invalid.status, 400);

    const reversed = await request(
        "/api/admin/reports/users?startDate=2026-12-31&endDate=2026-01-01",
        "GET", undefined, adminToken
    );
    assert.equal(reversed.status, 400);
}));

test("CSV export returns a downloadable file with report columns", () => withServer(async request => {
    const adminToken = await loginAdmin(request);
    const userToken = await registerUser(request);
    await request("/api/queues/dmv/join", "POST", {}, userToken);

    const result = await request(
        "/api/admin/reports/export?type=users",
        "GET", undefined, adminToken
    );
    assert.equal(result.status, 200);
    assert.match(result.headers.get("content-type"), /text\/csv/);
    assert.match(result.headers.get("content-disposition"), /attachment/);
    assert.match(result.data, /Customer Name/);
    assert.match(result.data, /report-user@example.com/);
}));

test("CSV export rejects an unsupported report type", () => withServer(async request => {
    const adminToken = await loginAdmin(request);
    const result = await request(
        "/api/admin/reports/export?type=not-a-report",
        "GET", undefined, adminToken
    );
    assert.equal(result.status, 400);
}));

test("CSV exports are available for service and overview reports", () => withServer(async request => {
    const adminToken = await loginAdmin(request);
    for (const type of ["services", "overview"]) {
        const result = await request(
            `/api/admin/reports/export?type=${type}`,
            "GET", undefined, adminToken
        );
        assert.equal(result.status, 200);
        assert.match(result.headers.get("content-type"), /text\/csv/);
        assert.match(result.data, type === "services" ? /Service Name/ : /Total Queue Entries/);
    }
}));
