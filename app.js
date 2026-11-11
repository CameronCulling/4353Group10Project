const express = require("express");
const path = require("node:path");

const { createStore } = require("./store");

const {
    createAuthMiddleware,
    registerAuthRoutes
} = require("./authRoutes");

const { registerQueueRoutes } = require("./queueRoutes");
const { registerServiceRoutes } = require("./serviceRoutes");

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
    // registerAdminRoutes(app, store, fail, auth);
    // registerNotificationRoutes(app, store, fail, auth);
    // registerHistoryRoutes(app, store, fail, auth);

    // Serve frontend files
    const root = path.join(__dirname, "..");

    // Support both the original sibling-folder layout and this ZIP's nested layout.
    const nestedAdminDashPath = path.join(__dirname, "Cameron_Culling_QueueSmart_AdminDash");
    const siblingAdminDashPath = path.join(root, "Cameron_Culling_QueueSmart_AdminDash");
    const fs = require("node:fs");
    const adminDashPath = fs.existsSync(nestedAdminDashPath) ? nestedAdminDashPath : siblingAdminDashPath;
    app.use(express.static(adminDashPath));

    app.get("/", (req, res) => {
        return res.redirect("/admin.html");
    });

    app.use("/shared",
        express.static(path.join(root, "shared"))
    );

    app.use("/Harris_Khan_QueueSmart_userdash",
        express.static(
            path.join(root, "Harris_Khan_QueueSmart_userdash")
        )
    );

    // Add other frontend directories when needed.

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