"use strict";

// Run explicitly after the reporting branch has been merged:
// node --test tests/final-report-contract.js
// Change these paths to match the reporting team's agreed API if needed.
const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { createTestApp } = require("./testHelpers");

const reportPath = process.env.QUEUESMART_REPORT_PATH || "/api/admin/reports";
const exportPath = process.env.QUEUESMART_EXPORT_PATH || "/api/admin/reports/export";

test("merged report and CSV endpoints enforce admin access and return real output", async () => {
    const { app, db } = createTestApp();
    const server = app.listen(0, "127.0.0.1");
    try {
        await once(server, "listening");
        const root = `http://127.0.0.1:${server.address().port}`;
        async function request(endpoint, token, body) {
            return fetch(root + endpoint, {
                method: body ? "POST" : "GET",
                headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
                body: body ? JSON.stringify(body) : undefined
            });
        }
        const registration = await request("/api/auth/register", null, { name: "Report Test User", email: "report@example.com", password: "ReportTest123!" });
        assert.equal(registration.status, 201);
        const user = (await registration.json()).token;
        const adminLogin = await request("/api/auth/login", null, { email: "admin@queuesmart.local", password: "Admin12345!" });
        assert.equal(adminLogin.status, 200);
        const admin = (await adminLogin.json()).token;
        const join = await request("/api/queues/dmv/join", user, {});
        assert.equal(join.status, 201);
        await join.text();
        for (const endpoint of [reportPath, exportPath]) {
            for (const [token, status] of [[undefined, 401], [user, 403]]) {
                const denied = await request(endpoint, token);
                assert.equal(denied.status, status, endpoint);
                await denied.text();
            }
        }
        const report = await request(reportPath, admin);
        assert.equal(report.status, 200, "Reporting route must be implemented");
        assert.match(report.headers.get("content-type") || "", /application\/json/i);
        const reportBody = await report.json();
        assert.ok(reportBody && typeof reportBody === "object");
        const csv = await request(exportPath, admin);
        assert.equal(csv.status, 200, "CSV export route must be implemented");
        assert.match(csv.headers.get("content-type") || "", /text\/csv/i);
        assert.match(csv.headers.get("content-disposition") || "", /attachment/i);
        const csvText = await csv.text();
        assert.ok(csvText.trim().split(/\r?\n/).length >= 2, "CSV should include a header and data");
    } finally {
        try {
            await new Promise((resolve, reject) => {
                server.close(error => error ? reject(error) : resolve());
                server.closeAllConnections();
            });
        } finally { db.close(); }
    }
});
