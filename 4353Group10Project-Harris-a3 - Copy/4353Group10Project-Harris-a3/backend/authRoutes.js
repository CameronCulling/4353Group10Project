const { randomUUID, randomBytes } = require('node:crypto');
const { hashPassword, verifyPassword } = require('./store');
const { registrationError, loginError } = require('./validation');

const publicUser = user => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role
});

function createAuthMiddleware(store, fail) {
  return (req, res, next) => {
    const match = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '');
    const userId = match && store.sessions.get(match[1]);
    req.user = store.users.find(user => user.id === userId);
    if (!req.user) return fail(res, 401, 'Please sign in first.');
    next();
  };
}

function registerAuthRoutes(app, store, fail, auth) {
  function createSession(user) {
    const token = randomBytes(32).toString('hex');
    store.sessions.set(token, user.id);
    return { token, user: publicUser(user) };
  }

  // Create regular-user accounts. Users cannot self-assign admin rights.
  app.post('/api/auth/register', (req, res) => {
    const error = registrationError(req.body);
    if (error) return fail(res, 400, error);

    const email = req.body.email.trim().toLowerCase();
    if (store.users.some(user => user.email === email)) {
      return fail(res, 409, 'Email is already registered.');
    }
    const user = {
      id: randomUUID(),
      name: req.body.name.trim(),
      email,
      passwordHash: hashPassword(req.body.password),
      role: 'user'
    };
    store.users.push(user);
    res.status(201).json(createSession(user));
  });

  // Check password, create a random session token, and return public details.
  app.post('/api/auth/login', (req, res) => {
    const error = loginError(req.body);
    if (error) return fail(res, 400, error);
    const email = req.body.email.trim().toLowerCase();
    const user = store.users.find(person => person.email === email);
    if (!user || !verifyPassword(req.body.password, user.passwordHash)) {
      return fail(res, 401, 'Invalid email or password.');
    }
    res.json(createSession(user));
  });

  app.get('/api/me', auth, (req, res) => res.json(publicUser(req.user)));

  app.post('/api/auth/logout', auth, (req, res) => {
    store.sessions.delete(req.headers.authorization.slice(7));
    res.json({ message: 'Signed out.' });
  });
}

module.exports = { createAuthMiddleware, registerAuthRoutes };
