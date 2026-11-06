
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

// Create a separate temporary test database.
const testDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'queuesmart-test-')
);

const testDatabasePath = path.join(
    testDir,
    'test.sqlite'
);

const { createApp } = require('../app');
const { createDatabase } = require('../db');
const { createUserRepository } = require('../userRepository');
const db = createDatabase(testDatabasePath);
const users = createUserRepository(db);

// Start a test server on an available port.
async function withServer(runTest, repository = users, database = db) {
    const app = createApp({ db: database, userRepository: repository });
    const server = app.listen(0);

    await new Promise(resolve => {
        server.once('listening', resolve);
    });

    const baseURL =
        `http://127.0.0.1:${server.address().port}`;

    try {
        await runTest(baseURL);
    } finally {
        await new Promise(resolve => {
            server.close(resolve);
        });
    }
}

async function post(baseURL, endpoint, body) {
    return fetch(baseURL + endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });
}

// Generate a unique test account.
function testUser() {
    return {
        name: 'Test Student',
        email: `${randomUUID()}@example.com`,
        password: 'SecureTest123!'
    };
}

// TEST 1: User registration
test('registration saves user in SQLite', async () => {
    await withServer(async baseURL => {
        const user = testUser();

        const response = await post(
            baseURL,
            '/api/auth/register',
            user
        );

        assert.equal(response.status, 201);

        const saved = db.prepare(`
            SELECT c.email, c.password_hash,
                   p.full_name
            FROM UserCredentials c
            JOIN UserProfile p
              ON c.user_id = p.user_id
            WHERE c.email = ?
        `).get(user.email);

        assert.ok(saved);
        assert.equal(saved.email, user.email);
        assert.equal(saved.full_name, user.name);

        // Password must not be stored as plain text.
        assert.notEqual(
            saved.password_hash,
            user.password
        );
    });
});

// TEST 2: Duplicate email
test('duplicate email is rejected', async () => {
    await withServer(async baseURL => {
        const user = testUser();

        const first = await post(
            baseURL,
            '/api/auth/register',
            user
        );

        const second = await post(
            baseURL,
            '/api/auth/register',
            user
        );

        assert.equal(first.status, 201);
        assert.equal(second.status, 409);
    });
});

// TEST 3: Correct login and user profile
test('valid login retrieves user profile', async () => {
    await withServer(async baseURL => {
        const user = testUser();

        await post(
            baseURL,
            '/api/auth/register',
            user
        );

        const login = await post(
            baseURL,
            '/api/auth/login',
            {
                email: user.email,
                password: user.password
            }
        );

        assert.equal(login.status, 200);

        const { token } = await login.json();

        const profile = await fetch(
            baseURL + '/api/me',
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        assert.equal(profile.status, 200);

        const data = await profile.json();

        assert.equal(data.name, user.name);
        assert.equal(data.email, user.email);
        assert.equal(data.role, 'user');
    });
});

// TEST 4: Incorrect password
test('invalid password is rejected', async () => {
    await withServer(async baseURL => {
        const user = testUser();

        await post(
            baseURL,
            '/api/auth/register',
            user
        );

        const response = await post(
            baseURL,
            '/api/auth/login',
            {
                email: user.email,
                password: 'WrongPassword123!'
            }
        );

        assert.equal(response.status, 401);
    });
});

// TEST 5: Missing registration fields
test('invalid registration is rejected', async () => {
    await withServer(async baseURL => {
        const response = await post(
            baseURL,
            '/api/auth/register',
            {
                email: 'invalid@example.com',
                password: 'SecureTest123!'
            }
        );

        assert.equal(response.status, 400);
    });
});

// TEST 6: Data survives a new app instance
test('saved user can log in after app restart', async () => {
    const user = testUser();

    await withServer(async baseURL => {
        const response = await post(
            baseURL,
            '/api/auth/register',
            user
        );

        assert.equal(response.status, 201);
    });

    const reopenedDb = createDatabase(testDatabasePath);
    try {
        await withServer(async baseURL => {
            const login = await post(
                baseURL,
                '/api/auth/login',
                {
                    email: user.email,
                    password: user.password
                }
            );

            assert.equal(login.status, 200);
        }, createUserRepository(reopenedDb), reopenedDb);
    } finally {
        reopenedDb.close();
    }
});

test('administrator is stored in SQLite', async () => {
    const adminData = {
        name: 'Database Administrator',
        email: `${randomUUID()}@example.com`,
        password: 'StrongAdminPassword123!'
    };
    const admin = users.createAdmin(adminData);
    assert.equal(admin.role, 'admin');
    const saved = users.findByEmail(adminData.email);
    assert.ok(saved);
    assert.equal(saved.role, 'admin');
    await withServer(async baseURL => {
        const login = await post(baseURL, '/api/auth/login', {
            email: adminData.email,
            password: adminData.password
        });
        assert.equal(login.status, 200);
        const data = await login.json();
        assert.equal(data.user.role, 'admin');
    });
});

// Remove temporary files after testing.
test.after(() => {
    db.close();
    fs.rmSync(testDir, {
        recursive: true,
        force: true
    });
});
