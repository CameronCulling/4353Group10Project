
const { randomUUID } = require('node:crypto');
const db = require('./db');
const { hashPassword } = require('./store');

// Find a registered user by email
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

// Find a registered user by ID
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

// Save a new user and their profile
function createUser({ name, email, password }) {
    const user = {
        id: randomUUID(),
        name: name.trim(),
        email: email.trim().toLowerCase(),
        passwordHash: hashPassword(password),
        role: 'user'
    };

    // Either both records are saved, or neither is saved.
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
        `).run(user.id, user.name);

        db.exec('COMMIT');
        return user;
    } catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }
}

module.exports = {
    findByEmail,
    findById,
    createUser
};
