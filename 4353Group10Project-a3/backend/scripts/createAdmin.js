const { getDefaultUserRepository } = require('../userRepository');
const { getDefaultDatabase } = require('../db');

const email = process.env.QUEUESMART_ADMIN_EMAIL;
const password = process.env.QUEUESMART_ADMIN_PASSWORD;
const name = process.env.QUEUESMART_ADMIN_NAME || 'QueueSmart Administrator';

if (!email || !password || password.length < 12) {
    console.error('Set QUEUESMART_ADMIN_EMAIL and a unique QUEUESMART_ADMIN_PASSWORD of at least 12 characters.');
    process.exitCode = 1;
} else {
    let db;
    try {
        db = getDefaultDatabase();
        const users = getDefaultUserRepository();
        if (users.findByEmail(email)) {
            throw new Error('An account with this email already exists.');
        }
        const admin = users.createAdmin({ name, email, password });
        console.log(`Administrator created: ${admin.email}`);
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    } finally {
        if (db) db.close();
    }
}
