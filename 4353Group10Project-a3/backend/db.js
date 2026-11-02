
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

// Database file location
const databasePath = process.env.QUEUESMART_DB_PATH
    || path.join(__dirname, 'queuesmart.sqlite');

// Open or create the SQLite database
const db = new DatabaseSync(databasePath);

// Enable foreign key enforcement
db.exec('PRAGMA foreign_keys = ON');

// Read and execute the database schema
const schema = fs.readFileSync(
    path.join(__dirname, 'schema.sql'),
    'utf8'
);

db.exec(schema);

module.exports = db;
