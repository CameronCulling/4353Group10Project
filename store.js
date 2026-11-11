const {
    randomUUID,
    randomBytes,
    scryptSync,
    timingSafeEqual
} = require("node:crypto");

// Hash a password
function hashPassword(password) {
    const salt = randomBytes(16).toString("hex");

    const hash = scryptSync(
        password,
        salt,
        64
    ).toString("hex");

    return `${salt}:${hash}`;
}

// Verify a password
function verifyPassword(password, storedHash) {
    if (typeof password !== "string" ||
        typeof storedHash !== "string") {
        return false;
    }

    const parts = storedHash.split(":");

    if (parts.length !== 2) {
        return false;
    }

    const [salt, hash] = parts;

    try {
        const suppliedHash = scryptSync(
            password,
            salt,
            64
        );

        const originalHash = Buffer.from(hash, "hex");

        return suppliedHash.length === originalHash.length &&
            timingSafeEqual(suppliedHash, originalHash);

    } catch {
        return false;
    }
}

function createStore() {
    return {
        users: [
            {
                id: randomUUID(),
                name: "QueueSmart Admin",
                email: "admin@queuesmart.local",
                passwordHash: hashPassword("Admin12345!"),
                role: "admin"
            }
        ],

        sessions: new Map(),

        services: [
            {
                id: "dmv",
                name: "DMV Services",
                description: "Driver and vehicle services",
                duration: 5,
                priority: "normal"
            },
            {
                id: "advising",
                name: "Student Advising",
                description: "Academic advising services",
                duration: 10,
                priority: "normal"
            },
            {
                id: "financial",
                name: "Financial Aid",
                description: "Financial aid assistance",
                duration: 8,
                priority: "normal"
            }
        ],

        queues: {
            dmv: [],
            advising: [],
            financial: []
        },

        notifications: [],

        history: []
    };
}

module.exports = {
    createStore,
    hashPassword,
    verifyPassword
};