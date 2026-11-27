"use strict";

// Apply the same security policy to every current and future admin API.
// Authentication reads the user's current role from the database.
function registerAdminProtection(app, auth, fail) {
    app.use(
        "/api/admin",
        (req, res, next) => {
            // Reports may contain customer information. Do not cache responses.
            res.set("Cache-Control", "no-store");
            next();
        },
        auth,
        (req, res, next) => {
            if (!req.user || req.user.role !== "admin") {
                return fail(res, 403, "Administrator access required.");
            }
            next();
        }
    );
}

module.exports = { registerAdminProtection };
