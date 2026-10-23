function registerNotificationRoutes(app, store, fail, auth) {
  // Return only signed-in user notifications.
  app.get("/api/notifications", auth, (req, res) => {
    const notifications = store.notifications
      .filter(notification => notification.userId === req.user.id)
      .slice()
      .reverse();

    res.json({
      notifications,
      unreadCount: notifications.filter(
        notification => !notification.read
      ).length
    });
  });

  // Mark all of the signed-in user notifications as read.
  app.patch("/api/notifications/read-all", auth, (req, res) => {
    let updatedCount = 0;

    store.notifications.forEach(notification => {
      if (notification.userId === req.user.id && !notification.read) {
        notification.read = true;
        updatedCount++;
      }
    });

    res.json({
      message: "All notifications marked as read.",
      updatedCount
    });
  });

  // Update notification read status.
  app.patch("/api/notifications/:notificationId", auth, (req, res) => {
    const { notificationId } = req.params;
    const body = req.body;

    if (!notificationId.trim() || notificationId.length > 100) {
      return fail(res, 400, "Invalid notification ID.");
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return fail(res, 400, "Request body must be a JSON object.");
    }

    if (typeof body.read !== "boolean") {
      return fail(res, 400, "Read status must be true or false.");
    }

    // Check ownership so users cannot change another user's messages
    const notification = store.notifications.find(item =>
      item.id === notificationId && item.userId === req.user.id
    );

    if (!notification) {
      return fail(res, 404, "Notification not found.");
    }

    notification.read = body.read;
    res.json(notification);
  });
}

module.exports = { registerNotificationRoutes };