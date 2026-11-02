const { randomBytes } = require('node:crypto');
const { verifyPassword } = require('./store');
const { registrationError, loginError } = require('./validation');

// Return only safe public user information
const publicUser = user => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role
});

// Check authentication tokens
function createAuthMiddleware(store, fail, users) {
    return (req, res, next) => {
        const match = /^Bearer ([a-f0-9]{64})$/.exec(
            req.headers.authorization || ''
        );

        const userId = match
            ? store.sessions.get(match[1])
            : null;

        // Registered users come from SQLite.
        // Keep the existing demo admin working temporarily.
        req.user = userId
            ? (
                users.findById(userId) ||
                store.users.find(user => user.id === userId)
            )
            : null;

        if (!req.user) {
            return fail(res, 401, 'Please sign in first.');
        }

        next();
    };
}

function registerAuthRoutes(app, store, fail, auth, users) {

    function createSession(user) {
        const token = randomBytes(32).toString('hex');

        store.sessions.set(token, user.id);

        return {
            token,
            user: publicUser(user)
        };
    }

    // REGISTER USER
    app.post('/api/auth/register', (req, res, next) => {

        const error = registrationError(req.body);

        if (error) {
            return fail(res, 400, error);
        }

        const email = req.body.email.trim().toLowerCase();

        // Check SQLite and the existing demo admin
        if (
            users.findByEmail(email) ||
            store.users.some(user => user.email === email)
        ) {
            return fail(
                res,
                409,
                'Email is already registered.'
            );
        }

        try {
            // Save credentials and profile in SQLite
            const user = users.createUser({
                name: req.body.name,
                email: email,
                password: req.body.password
            });

            return res.status(201).json(
                createSession(user)
            );

        } catch (error) {

            // Handle duplicate emails even if two requests
            // attempt to register at the same time.
            if (
                error.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
                error.message?.includes('UNIQUE constraint failed')
            ) {
                return fail(
                    res,
                    409,
                    'Email is already registered.'
                );
            }

            return next(error);
        }
    });

    // LOGIN USER
    app.post('/api/auth/login', (req, res) => {

        const error = loginError(req.body);

        if (error) {
            return fail(res, 400, error);
        }

        const email = req.body.email.trim().toLowerCase();

        // Retrieve from SQLite, with legacy admin fallback
        const user = users.findByEmail(email) ||
            store.users.find(person => person.email === email);

        if (
            !user ||
            !verifyPassword(req.body.password, user.passwordHash)
        ) {
            return fail(
                res,
                401,
                'Invalid email or password.'
            );
        }

        return res.json(createSession(user));
    });

    // GET CURRENT USER
    app.get('/api/me', auth, (req, res) => {
        res.json(publicUser(req.user));
    });

    // LOGOUT USER
    app.post('/api/auth/logout', auth, (req, res) => {

        store.sessions.delete(
            req.headers.authorization.slice(7)
        );

        res.json({
            message: 'Signed out.'
        });
    });
}

module.exports = {
    createAuthMiddleware,
    registerAuthRoutes
};
