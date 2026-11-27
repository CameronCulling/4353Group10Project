"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { registerAdminProtection } = require("../adminAccess");

// Exercise the actual middleware without a server or external dependencies.
function simulate(user) {
    let middleware;
    let authenticated = false;
    let continued = false;
    const req = {};
    const res = { headers: {}, set(key, value) { this.headers[key] = value; } };
    const app = { use(path, ...handlers) {
        assert.equal(path, "/api/admin");
        middleware = handlers;
    } };
    const fail = (response, status, message) => {
        response.status = status;
        response.message = message;
    };
    const auth = (request, response, next) => {
        authenticated = true;
        if (!user) return fail(response, 401, "Please sign in first.");
        request.user = user;
        next();
    };
    registerAdminProtection(app, auth, fail);
    let i = 0;
    function next() {
        if (i === middleware.length) { continued = true; return; }
        middleware[i++](req, res, next);
    }
    next();
    assert.equal(authenticated, true);
    assert.equal(res.headers["Cache-Control"], "no-store");
    return { res, continued };
}

test("anonymous access stops with 401", () => {
    const { res, continued } = simulate(null);
    assert.equal(res.status, 401);
    assert.equal(continued, false);
});

test("regular users cannot access admin APIs", () => {
    const { res, continued } = simulate({ role: "user" });
    assert.equal(res.status, 403);
    assert.equal(continued, false);
});

test("administrators continue to the protected endpoint", () => {
    const { res, continued } = simulate({ role: "admin" });
    assert.equal(res.status, undefined);
    assert.equal(continued, true);
});

test("admin guard also rejects a missing authenticated identity", () => {
    let middleware;
    const app = { use(path, ...handlers) { middleware = handlers; } };
    let rejected = false;
    registerAdminProtection(app, (req, res, next) => next(), (res, status) => {
        assert.equal(status, 403);
        rejected = true;
    });
    middleware[2]({}, {}, () => assert.fail("Unexpected admin access"));
    assert.equal(rejected, true);
});
