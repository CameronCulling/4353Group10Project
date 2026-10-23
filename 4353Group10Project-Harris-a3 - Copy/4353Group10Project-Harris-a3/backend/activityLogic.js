const { randomUUID } = require("node:crypto");

// Check required text fields before storing activity.
function validateText(value, field, maxLength) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required and must be text.`);
  }

  if (value.length > maxLength) {
    throw new Error(`${field} cannot exceed ${maxLength} characters.`);
  }
}

function validateActivity(userId, service, entry) {
  validateText(userId, "User ID", 100);

  if (!service || !entry) {
    throw new Error("Service and queue entry are required.");
  }

  validateText(service.id, "Service ID", 100);
  validateText(service.name, "Service name", 100);
  validateText(entry.joinedAt, "Join time", 40);

  if (!Number.isFinite(Date.parse(entry.joinedAt))) {
    throw new Error("Join time must be a valid date.");
  }
}

function createNotification(store, userId, service, type, message) {
  const notification = {
    id: randomUUID(),
    userId,
    serviceId: service.id,
    serviceName: service.name,
    type,
    message,
    read: false,
    createdAt: new Date().toISOString()
  };

  store.notifications.push(notification);
  return notification;
}

// Called after someone successfully joins a queue.
function recordQueueJoin(store, userId, service, entry) {
  validateActivity(userId, service, entry);

  const history = {
    id: randomUUID(),
    userId,
    serviceId: service.id,
    serviceName: service.name,
    joinedAt: entry.joinedAt,
    endedAt: null,
    outcome: "waiting",
    waitMinutes: null
  };

  store.history.push(history);

  // Keep the history ID on the queue entry so we update the right visit.
  entry.historyId = history.id;

  createNotification(
    store,
    userId,
    service,
    "joined",
    `You joined the ${service.name} queue.`
  );

  return history;
}

// Called after someone leaves or is served.
function recordQueueExit(store, userId, service, entry, outcome) {
  validateActivity(userId, service, entry);

  if (outcome !== "left" && outcome !== "served") {
    throw new Error("Outcome must be left or served.");
  }

  const history = store.history.find(item =>
    item.id === entry.historyId &&
    item.userId === userId &&
    item.serviceId === service.id
  );

  if (!history || history.outcome !== "waiting") {
    throw new Error("Active history record not found.");
  }

  const endedAt = new Date();

  history.endedAt = endedAt.toISOString();
  history.outcome = outcome;
  history.waitMinutes = Math.max(
    0,
    Math.round(
      (endedAt.getTime() - Date.parse(history.joinedAt)) / 60000
    )
  );

  return history;
}

// Notify the first two people once per queue visit.
function notifyNearbyUsers(store, service, queue) {
  queue.slice(0, 2).forEach(entry => {
    if (entry.nearTurnNotified) {
      return;
    }

    createNotification(
      store,
      entry.userId,
      service,
      "near-turn",
      `Your turn at ${service.name} is approaching. ` +
      "You are one of the next two people in line."
    );

    entry.nearTurnNotified = true;
  });
}

module.exports = {
  recordQueueJoin,
  recordQueueExit,
  notifyNearbyUsers
};