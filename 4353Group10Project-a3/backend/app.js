const express = require("express");
const path = require("node:path");

const { createStore } = require("./store");

const {
    createAuthMiddleware,
    registerAuthRoutes
} = require("./authRoutes");

const { registerQueueRoutes } = require("./queueRoutes");
const { registerServiceRoutes } = require("./serviceRoutes");
const { registerAdminRoutes } = require("./adminRoutes");
const { registerNotificationRoutes } = require("./notificationRoutes");
const { registerHistoryRoutes } = require("./historyRoutes");

function createApp() {
    const app = express();

    const store = createStore();

    // Parse JSON request bodies
    app.use(express.json({ limit: "10kb" }));

    // Standard error response
    function fail(res, status, message) {
        return res.status(status).json({
            error: message
        });
    }

    // Authentication middleware
    const auth = createAuthMiddleware(store, fail);

    // Register authentication routes
    registerAuthRoutes(app, store, fail, auth);

    // Register queue routes
    registerQueueRoutes(app, store, fail, auth);

    // Register service management routes
    registerServiceRoutes(app, store, fail, auth);

    // Future teammate routes:
     registerAdminRoutes(app, store, fail, auth);
     registerNotificationRoutes(app, store, fail, auth);
     registerHistoryRoutes(app, store, fail, auth);

    // Serve frontend files
    // Serve frontend files
    const root = path.join(__dirname, "..");
    const fs = require("node:fs");

        
// Support both possible admin folder locations
    const nestedAdminDashPath = path.join(
        __dirname,
        "Cameron_Culling_QueueSmart_AdminDash"
    );

    const siblingAdminDashPath = path.join(
     root,
    "Cameron_Culling_QueueSmart_AdminDash"
    );

    const adminDashPath = fs.existsSync(nestedAdminDashPath)
     ? nestedAdminDashPath
     : siblingAdminDashPath;

// Redirect homepage to login
    app.get("/", (req, res) => {
        res.redirect("/Suyash_QueueSmart_Auth/index.html");
    });

// Authentication pages
    app.use(
        "/Suyash_QueueSmart_Auth",
        express.static(
            path.join(root, "Suyash_QueueSmart_Auth", "Suyash_QueueSmart_Auth")
        )
    );

// Admin pages (accessible at /admin.html, /queue.html, etc.)
    app.use(express.static(adminDashPath));

// Admin pages (also accessible through the full folder URL)
    app.use(
        "/Cameron_Culling_QueueSmart_AdminDash",
        express.static(adminDashPath)
    );

// User dashboard
    app.use(
        "/Harris_Khan_QueueSmart_userdash",
        express.static(
            path.join(root, "Harris_Khan_QueueSmart_userdash")
        )
    );

// Notifications
    app.use(
        "/Sarah_Andrus_QueueSmart_Notifs",
        express.static(
            path.join(root, "Sarah_Andrus_QueueSmart_Notifs")
        )
    );

    // Shared files
    app.use(
        "/shared",
        express.static(path.join(root, "shared"))
    );

    // Unknown API endpoint
    app.use("/api", (req, res) => {
        return fail(res, 404, "API endpoint not found.");
    });

    // Handle unexpected server errors
    app.use((err, req, res, next) => {
        if (err && err.type === "entity.parse.failed") {
            return fail(res, 400, "Invalid JSON request body.");
        }
        console.error(err);
        return fail(res, 500, "Internal server error.");
    });

    return app;
}

module.exports = { createApp };