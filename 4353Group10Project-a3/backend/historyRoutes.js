// Return queue participation history for user

function registerHistoryRoutes(app, store, fail, auth) {
  app.get("/api/history", auth, (req, res) => {
    const history = store.history
      .filter(entry => entry.userId === req.user.id)
      .slice()
      .reverse();

    res.json({ history });
  });
}

module.exports = { registerHistoryRoutes };