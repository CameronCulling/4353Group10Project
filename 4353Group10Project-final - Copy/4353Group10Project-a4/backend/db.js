"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const DEFAULT_SERVICES = [
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
];

function migrateDatabase(database) {
    // CREATE TABLE IF NOT EXISTS does not add columns to an old table.
    const notificationColumns = database
        .prepare("PRAGMA table_info(Notification)")
        .all();

    if (
        notificationColumns.length &&
        !notificationColumns.some(column => column.name === "type")
    ) {
        database.exec(`
            ALTER TABLE Notification
            ADD COLUMN type TEXT NOT NULL DEFAULT 'general'
        `);
    }

    // Seed the built-in services and an initially open queue for each.
    const insertService = database.prepare(`
        INSERT OR IGNORE INTO Service (
            service_id, service_name, description,
            expected_duration, priority_level
        )
        VALUES (?, ?, ?, ?, ?)
    `);

    const insertQueue = database.prepare(`
        INSERT INTO Queue (queue_id, service_id, status)
        SELECT lower(hex(randomblob(16))), ?, 'open'
        WHERE NOT EXISTS (
            SELECT 1 FROM Queue WHERE service_id = ?
        )
    `);

    for (const service of DEFAULT_SERVICES) {
        insertService.run(
            service.id,
            service.name,
            service.description,
            service.duration,
            service.priority
        );
        insertQueue.run(service.id, service.id);
    }
}

function createDatabase(filename) {
    const location = filename ||
        process.env.QUEUESMART_DB_PATH ||
        path.join(__dirname, "queuesmart.sqlite");

    const database = new DatabaseSync(location);

    try {
        database.exec("PRAGMA foreign_keys = ON");
        database.exec("PRAGMA busy_timeout = 5000");

        const schema = fs.readFileSync(
            path.join(__dirname, "schema.sql"),
            "utf8"
        );

        database.exec(schema);
        migrateDatabase(database);

        return database;
    } catch (error) {
        database.close();
        throw error;
    }
}

let defaultDatabase = null;

function getDefaultDatabase() {
    if (!defaultDatabase) {
        defaultDatabase = createDatabase();
    }
    return defaultDatabase;
}

module.exports = {
    createDatabase,
    getDefaultDatabase,
    migrateDatabase
};
