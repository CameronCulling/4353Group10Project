const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createApp } = require("../app");

async function withServer(run) {
  const server = createApp().listen(0);
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
    return { status: response.status, data: await response.json().catch(() => null) };
  }
  try { await run(request); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

async function getToken(request, email, password) {
  const result = await request("/api/auth/login", "POST", { email, password });
  assert.equal(result.status, 200);
  return result.data.token;
}
const adminLogin = ["admin@queuesmart.local", "Admin12345!"];
const validService = { name: "Test Service", description: "Testing", duration: 5, priority: "low" };

test("services endpoint requires authentication and returns seeded services", () => withServer(async request => {
  assert.equal((await request("/api/services")).status, 401);
  const token = await getToken(request, ...adminLogin);
  const result = await request("/api/services", "GET", undefined, token);
  assert.equal(result.status, 200);
  assert.ok(result.data.some(service => service.id === "dmv"));
}));

test("only administrators can create services", () => withServer(async request => {
  const user = await request("/api/auth/register", "POST", {
    name: "Test User", email: "user@example.com", password: "SecurePass123!"
  });
  assert.equal(user.status, 201);
  assert.equal((await request("/api/services", "POST", validService, user.data.token)).status, 403);

  const admin = await getToken(request, ...adminLogin);
  const created = await request("/api/services", "POST", validService, admin);
  assert.equal(created.status, 201);
  assert.equal(created.data.name, validService.name);
  assert.ok(created.data.id);
}));

test("service creation validates required fields, types, limits, and priority", () => withServer(async request => {
  const token = await getToken(request, ...adminLogin);
  for (const body of [
    null,
    { ...validService, name: "" },
    { ...validService, name: "x".repeat(101) },
    { ...validService, description: "" },
    { ...validService, description: "x".repeat(501) },
    { ...validService, duration: "5" },
    { ...validService, duration: 0 },
    { ...validService, duration: 1441 },
    { ...validService, priority: "urgent" }
  ]) {
    const result = await request("/api/services", "POST", body, token);
    assert.equal(result.status, 400, JSON.stringify(body));
    assert.equal(typeof result.data.error, "string");
  }
}));

test("service creation rejects duplicate names regardless of case", () => withServer(async request => {
  const token = await getToken(request, ...adminLogin);
  assert.equal((await request("/api/services", "POST", validService, token)).status, 201);
  const duplicate = await request("/api/services", "POST", { ...validService, name: " test service " }, token);
  assert.equal(duplicate.status, 409);
}));

test("admins can update and delete services; invalid and missing IDs are handled", () => withServer(async request => {
  const token = await getToken(request, ...adminLogin);
  const created = await request("/api/services", "POST", validService, token);
  const id = created.data.id;

  const updated = await request(`/api/services/${id}`, "PATCH", { duration: 12, priority: "high" }, token);
  assert.equal(updated.status, 200);
  assert.equal(updated.data.duration, 12);
  assert.equal(updated.data.priority, "high");

  assert.equal((await request("/api/services/not-found", "PATCH", { duration: 5 }, token)).status, 404);
  assert.equal((await request(`/api/services/${id}`, "DELETE", undefined, token)).status, 200);
  assert.equal((await request(`/api/services/${id}`, "DELETE", undefined, token)).status, 404);
}));
