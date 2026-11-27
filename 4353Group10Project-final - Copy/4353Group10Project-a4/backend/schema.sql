
-- 1. Authentication information
CREATE TABLE IF NOT EXISTS UserCredentials (
    user_id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE
        CHECK (length(email) <= 254),
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user'
        CHECK (role IN ('user', 'admin'))
);

-- 2. User profile information
CREATE TABLE IF NOT EXISTS UserProfile (
    user_id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL
        CHECK (length(trim(full_name)) BETWEEN 1 AND 100),
    contact TEXT,
    preferences TEXT DEFAULT '{}',
    FOREIGN KEY (user_id)
        REFERENCES UserCredentials(user_id)
        ON DELETE CASCADE
);

-- 3. Services
CREATE TABLE IF NOT EXISTS Service (
    service_id TEXT PRIMARY KEY,
    service_name TEXT NOT NULL,
    description TEXT,
    expected_duration INTEGER NOT NULL
        CHECK (expected_duration > 0),
    priority_level TEXT NOT NULL DEFAULT 'normal'
        CHECK (priority_level IN ('low', 'normal', 'medium', 'high'))
);

-- 4. Queues
CREATE TABLE IF NOT EXISTS Queue (
    queue_id TEXT PRIMARY KEY,
    service_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'closed'
        CHECK (status IN ('open', 'closed')),
    created_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (service_id)
        REFERENCES Service(service_id)
);

-- 5. Users waiting in queues
CREATE TABLE IF NOT EXISTS QueueEntry (
    entry_id TEXT PRIMARY KEY,
    queue_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    position INTEGER NOT NULL
        CHECK (position > 0),
    join_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'waiting'
        CHECK (status IN ('waiting', 'served', 'canceled')),
    FOREIGN KEY (queue_id)
        REFERENCES Queue(queue_id),
    FOREIGN KEY (user_id)
        REFERENCES UserCredentials(user_id)
);

-- Prevent duplicate active entries
CREATE UNIQUE INDEX IF NOT EXISTS unique_waiting_entry
ON QueueEntry(queue_id, user_id)
WHERE status = 'waiting';

-- 6. Notifications and activity history
CREATE TABLE IF NOT EXISTS Notification (
    notification_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    message TEXT NOT NULL CHECK (length(trim(message)) > 0),
    type TEXT NOT NULL DEFAULT 'general',
    timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'sent'
        CHECK (status IN ('sent', 'viewed')),
    FOREIGN KEY (user_id)
        REFERENCES UserCredentials(user_id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS History (
    history_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    service_id TEXT NOT NULL,
    service_name TEXT NOT NULL,
    joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at TEXT,
    wait_minutes INTEGER NOT NULL DEFAULT 0
        CHECK (wait_minutes >= 0),
    outcome TEXT NOT NULL DEFAULT 'waiting'
        CHECK (outcome IN ('waiting', 'left', 'served', 'canceled')),
    FOREIGN KEY (user_id)
        REFERENCES UserCredentials(user_id)
        ON DELETE CASCADE
);