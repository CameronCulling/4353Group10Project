const list = document.getElementById("notification-list");
const unreadCount = document.getElementById("unread-count");
const errorMessage = document.getElementById("error-message");
const markAllButton = document.getElementById("mark-all-read");
const refreshButton = document.getElementById("refresh-button");

let busy = false;

function showError(error) {
  errorMessage.textContent = error.message;
  errorMessage.hidden = false;
}

// Display server data using textContent so message text stays plain text.
function renderNotifications(data) {
  list.replaceChildren();

  unreadCount.textContent =
    data.unreadCount + " unread notification" +
    (data.unreadCount === 1 ? "" : "s");

  markAllButton.disabled = data.unreadCount === 0;

  if (data.notifications.length === 0) {
    const empty = document.createElement("p");
    empty.textContent =
      "No notifications yet. Join a queue to receive updates.";
    list.appendChild(empty);
    return;
  }

  data.notifications.forEach(notification => {
    const card = document.createElement("article");
    card.className = "notification";

    if (notification.read) {
      card.style.backgroundColor = "#f4f8f6";
      card.style.borderLeftColor = "#6b8185";
    }

    const heading = document.createElement("strong");
    heading.textContent = notification.serviceName;

    const message = document.createElement("p");
    message.textContent = notification.message;

    const time = document.createElement("time");
    time.dateTime = notification.createdAt;
    time.textContent =
      new Date(notification.createdAt).toLocaleString();

    const actions = document.createElement("p");
    const button = document.createElement("button");
    button.className = "secondary-button";
    button.type = "button";
    button.textContent = notification.read
      ? "Mark as unread"
      : "Mark as read";

    button.addEventListener("click", () => {
      runAction(async () => {
        await QueueSmart.request(
          `/api/notifications/${notification.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({ read: !notification.read })
          }
        );

        await loadNotifications();
      });
    });

    actions.appendChild(button);
    card.append(heading, message, time, actions);
    list.appendChild(card);
  });
}

async function loadNotifications() {
  const data = await QueueSmart.request("/api/notifications");
  renderNotifications(data);
}

// Prevent overlapping requests and show errors on the page.
async function runAction(action) {
  if (busy) {
    return;
  }

  busy = true;
  errorMessage.hidden = true;
  refreshButton.disabled = true;
  markAllButton.disabled = true;
  list.querySelectorAll("button").forEach(button => {
    button.disabled = true;
  });

  try {
    await action();
  } catch (error) {
    showError(error);
  } finally {
    busy = false;
    refreshButton.disabled = false;
    list.querySelectorAll("button").forEach(button => {
      button.disabled = false;
    });

    // Restore the correct state even if a request failed.
    markAllButton.disabled =
      list.querySelector("article") === null ||
      !Array.from(list.querySelectorAll("article button")).some(
        button => button.textContent === "Mark as read"
      );
  }
}

refreshButton.addEventListener("click", () => {
  runAction(loadNotifications);
});

markAllButton.addEventListener("click", () => {
  runAction(async () => {
    await QueueSmart.request(
      "/api/notifications/read-all",
      { method: "PATCH" }
    );

    await loadNotifications();
  });
});

runAction(loadNotifications);