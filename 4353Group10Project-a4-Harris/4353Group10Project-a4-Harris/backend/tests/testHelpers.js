const { createApp } = require('../app');
const { createDatabase } = require('../db');
const { createUserRepository } = require('../userRepository');

function createTestApp() {
    const db = createDatabase(':memory:');
    try {
        const users = createUserRepository(db);
        // Test-only credentials; never used in production.
        users.createAdmin({
            name: 'Test Administrator',
            email: 'admin@queuesmart.local',
            password: 'Admin12345!'
        });
        return { app: createApp({ userRepository: users }), db };
    } catch (error) {
        db.close();
        throw error;
    }
}

module.exports = { createTestApp };
