
const { randomUUID } = require('node:crypto');
const { hashPassword } = require('./store');
const { registrationError } = require('./validation');
const { getDefaultDatabase } = require('./db');

function createUserRepository(db) {

    // Find user by email
    function findByEmail(email) {
        return db.prepare(`
            SELECT
                c.user_id AS id,
                p.full_name AS name,
                c.email,
                c.password_hash AS passwordHash,
                c.role
            FROM UserCredentials c
            JOIN UserProfile p
                ON c.user_id = p.user_id
            WHERE c.email = ?
        `).get(email.trim().toLowerCase()) || null;
    }

    // Find user by ID
    function findById(userId) {
        return db.prepare(`
            SELECT
                c.user_id AS id,
                p.full_name AS name,
                c.email,
                c.password_hash AS passwordHash,
                c.role
            FROM UserCredentials c
            JOIN UserProfile p
                ON c.user_id = p.user_id
            WHERE c.user_id = ?
        `).get(userId) || null;
    }

    // Internal account creation
    function createAccount(data, role) {
        const error = registrationError({
            name: data.name,
            email: data.email,
            password: data.password
        });

        if (error) {
            throw new Error(error);
        }

        if (!['user', 'admin'].includes(role)) {
            throw new Error('Invalid account role.');
        }

        const user = {
            id: randomUUID(),
            name: data.name.trim(),
            email: data.email.trim().toLowerCase(),
            passwordHash: hashPassword(data.password),
            role
        };

        db.exec('BEGIN IMMEDIATE');

        try {
            db.prepare(`
                INSERT INTO UserCredentials
                    (user_id, email, password_hash, role)
                VALUES (?, ?, ?, ?)
            `).run(
                user.id,
                user.email,
                user.passwordHash,
                user.role
            );

            db.prepare(`
                INSERT INTO UserProfile
                    (user_id, full_name)
                VALUES (?, ?)
            `).run(
                user.id,
                user.name
            );

            db.exec('COMMIT');

            return user;
        } catch (error) {
            db.exec('ROLLBACK');
            throw error;
        }
    }

    // Public registration can only create regular users
    function createUser(data) {
        return createAccount(data, 'user');
    }

    // Only trusted server-side code should call this
    function createAdmin(data) {
        return createAccount(data, 'admin');
    }

    return {
        findByEmail,
        findById,
        createUser,
        createAdmin
    };
}

// The main application shares one repository
let defaultRepository = null;

function getDefaultUserRepository() {
    if (!defaultRepository) {
        defaultRepository = createUserRepository(
            getDefaultDatabase()
        );
    }

    return defaultRepository;
}

module.exports = {
    createUserRepository,
    getDefaultUserRepository
};
