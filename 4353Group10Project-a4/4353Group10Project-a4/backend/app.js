
"use strict";

const express = require("express");
const path = require("node:path");

const { createStore } = require("./store");

const { getDefaultDatabase } = require("./db");
const { createUserRepository } = require("./userRepository");
const { createQueueRepository } = require("./queueRepository");

const {
    createAuthMiddleware,
    registerAuthRoutes
} = require("./authRoutes");

const { registerQueueRoutes } = require("./queueRoutes");
const { registerServiceRoutes } = require("./serviceRoutes");
const { registerAdminRoutes } = require("./adminRoutes");
const { registerNotificationRoutes } = require("./notificationRoutes");
const { registerHistoryRoutes } = require("./historyRoutes");
const { createActivityLogic } = require("./activityLogic");


function createApp({
    db: suppliedDb,
    userRepository,
    queueRepository
} = {}) {

    const app = express();
    const store = createStore();

    // Use the same database connection for users and queues.
    const db = suppliedDb || getDefaultDatabase();

    // All repositories and routes must use this exact same connection.
    const users = userRepository || createUserRepository(db);

    const queues = queueRepository ||
        createQueueRepository(db);

    const activity = createActivityLogic(db);
    app.use(express.json({ limit: "10kb", strict: false }));


    // Standard API error response.
    function fail(res, status, message) {
        return res.status(status).json({
            error: message
        });
    }


    // Authentication middleware.
    const auth = createAuthMiddleware(
        store,
        fail,
        users
    );


    // Register API routes.
    registerAuthRoutes(
        app,
        store,
        fail,
        auth,
        users
    );

    registerQueueRoutes(
        app,
        store,
        fail,
        auth,
        queues,
        activity
    );

    registerServiceRoutes(
        app,
        store,
        fail,
        auth,
        db
    );

    registerAdminRoutes(
        app,
        store,
        fail,
        auth,
        db,
        activity);

    registerNotificationRoutes(
        app,
        store,
        fail,
        auth,
        db
    );

    registerHistoryRoutes(
        app,
        store,
        fail,
        auth,
        db
    );


    // --------------------------------------------------
    // FRONTEND STATIC FILES
    // --------------------------------------------------

    // Redirect the root page to the login page.
    app.get("/", (req, res) => {
        res.redirect("/Suyash_QueueSmart_Auth/index.html");
    });


    // Authentication pages.
    app.use(
        "/Suyash_QueueSmart_Auth",
        express.static(
            path.join(__dirname, "../Suyash_QueueSmart_Auth/Suyash_QueueSmart_Auth")
        )
    );


    // User dashboard and queue pages.
    app.use(
        "/Harris_Khan_QueueSmart_userdash",
        express.static(
            path.join(__dirname, "../Harris_Khan_QueueSmart_userdash")
        )
    );


    // Admin dashboard pages.
    app.use(
        "/Cameron_Culling_QueueSmart_AdminDash",
        express.static(
            path.join(__dirname, "../Cameron_Culling_QueueSmart_AdminDash")
        )
    );


    // Notifications pages.
    app.use(
        "/Sarah_Andrus_QueueSmart_Notifs",
        express.static(
            path.join(__dirname, "../Sarah_Andrus_QueueSmart_Notifs")
        )
    );


    // Shared frontend JavaScript files.
    app.use(
        "/shared",
        express.static(
            path.join(__dirname, "../shared")
        )
    );


    // --------------------------------------------------
    // API FALLBACK
    // --------------------------------------------------

    // Return a JSON response for unknown API endpoints.
    app.use("/api", (req, res) => {
        return fail(res, 404, "API endpoint not found.");
    });


    // General error handler.
    app.use((error, req, res, next) => {
        console.error(error);

        if (res.headersSent) {
            return next(error);
        }

        if (error instanceof SyntaxError && error.status === 400) {
            return fail(res, 400, "Invalid JSON request body.");
        }

        return fail(
            res,
            500,
            "An unexpected server error occurred."
        );
    });


    return app;
}


module.exports = { createApp };