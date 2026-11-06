
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

// Create and initialize a SQLite database
function createDatabase(filename) {
    const location = filename ||
        process.env.QUEUESMART_DB_PATH ||
        path.join(__dirname, 'queuesmart.sqlite');

    const database = new DatabaseSync(location);

    try {
        database.exec('PRAGMA foreign_keys = ON');

        const schema = fs.readFileSync(
            path.join(__dirname, 'schema.sql'),
            'utf8'
        );

        database.exec(schema);

        return database;
    } catch (error) {
        database.close();
        throw error;
    }
}

// Create the main database only when needed
let defaultDatabase = null;

function getDefaultDatabase() {
    if (!defaultDatabase) {
        defaultDatabase = createDatabase();
    }

    return defaultDatabase;
}

module.exports = {
    createDatabase,
    getDefaultDatabase
};
