// Authentication API unit/integration tests using Node.js's built-in test runner.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../app');
const { registrationError, loginError } = require('../validation');
const { hashPassword, verifyPassword } = require('../store');

async function withServer(run) {
  const server = createApp().listen(0);
  const root = `http://127.0.0.1:${server.address().port}`;
  async function request(path, method = 'GET', body, token) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
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

const valid = { name: 'Test User', email: 'User@Example.com', password: 'SecurePass123!' };

test('validation rejects missing, invalid, and excessively long fields', () => {
  assert.match(registrationError(null), /object/);
  assert.match(registrationError({ ...valid, name: '' }), /Name/);
  assert.match(registrationError({ ...valid, name: 'x'.repeat(81) }), /80/);
  assert.match(registrationError({ ...valid, email: 'bad' }), /Email/);
  assert.match(registrationError({ ...valid, password: 'short' }), /Password/);
  assert.match(registrationError({ ...valid, role: 'admin' }), /only/);
  assert.match(loginError({ email: valid.email, password: 123 }), /Password/);
  assert.equal(registrationError(valid), null);
  assert.equal(loginError(valid), null);
});

test('password hashing salts passwords and verification checks them', () => {
  const first = hashPassword(valid.password);
  const second = hashPassword(valid.password);
  assert.notEqual(first, second);
  assert.equal(verifyPassword(valid.password, first), true);
  assert.equal(verifyPassword('incorrect-password', first), false);
});

test('registration creates a regular user and safely returns a session', () => withServer(async request => {
  const result = await request('/api/auth/register', 'POST', valid);
  assert.equal(result.status, 201);
  assert.equal(result.data.user.role, 'user');
  assert.equal(result.data.user.email, 'user@example.com');
  assert.equal(result.data.user.passwordHash, undefined);
  assert.match(result.data.token, /^[a-f0-9]{64}$/);
  const me = await request('/api/me', 'GET', undefined, result.data.token);
  assert.equal(me.status, 200);
  assert.equal(me.data.name, 'Test User');
}));

test('registration refuses duplicate email and administrator escalation', () => withServer(async request => {
  const created = await request('/api/auth/register', 'POST', valid);
  assert.equal(created.status, 201);
  assert.equal((await request('/api/auth/register', 'POST', { ...valid, email: ' user@example.com ' })).status, 409);
  assert.equal((await request('/api/auth/register', 'POST', { ...valid, role: 'admin' })).status, 400);
}));

test('login authenticates valid users case-insensitively', () => withServer(async request => {
  await request('/api/auth/register', 'POST', valid);
  const loggedIn = await request('/api/auth/login', 'POST', { email: 'USER@example.com', password: valid.password });
  assert.equal(loggedIn.status, 200);
  assert.equal(loggedIn.data.user.email, 'user@example.com');
  assert.ok(loggedIn.data.token);
}));

test('login rejects wrong passwords and unknown accounts', () => withServer(async request => {
  await request('/api/auth/register', 'POST', valid);
  assert.equal((await request('/api/auth/login', 'POST', { email: valid.email, password: 'wrong' })).status, 401);
  assert.equal((await request('/api/auth/login', 'POST', { email: 'nobody@example.com', password: 'wrong' })).status, 401);
  assert.equal((await request('/api/auth/login', 'POST', { email: 'not-an-email', password: 'wrong' })).status, 400);
}));

test('profile requires a valid session; logout invalidates session token', () => withServer(async request => {
  assert.equal((await request('/api/me')).status, 401);
  assert.equal((await request('/api/me', 'GET', undefined, 'fake-token')).status, 401);
  const created = await request('/api/auth/register', 'POST', valid);
  assert.equal((await request('/api/auth/logout', 'POST', undefined, created.data.token)).status, 200);
  assert.equal((await request('/api/me', 'GET', undefined, created.data.token)).status, 401);
}));

test('administrator account logs in and can access protected admin routes', () => withServer(async request => {
  const admin = await request('/api/auth/login', 'POST', { email: 'admin@queuesmart.local', password: 'Admin12345!' });
  assert.equal(admin.status, 200);
  assert.equal(admin.data.user.role, 'admin');
  const created = await request('/api/auth/register', 'POST', valid);
  assert.equal((await request('/api/services', 'POST', { name: 'Test', description: 'Testing', duration: 5, priority: 'low' }, created.data.token)).status, 403);
  assert.equal((await request('/api/services', 'POST', { name: 'Test', description: 'Testing', duration: 5, priority: 'low' }, admin.data.token)).status, 201);
}));
