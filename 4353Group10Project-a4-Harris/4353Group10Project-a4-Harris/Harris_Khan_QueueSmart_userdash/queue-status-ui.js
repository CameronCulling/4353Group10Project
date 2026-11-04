document.addEventListener("DOMContentLoaded", async () => {
    const serviceId = localStorage.getItem("activeQueue");

    const serviceName = document.getElementById("service-name");
    const position = document.getElementById("position");
    const waitTime = document.getElementById("wait-time");
    const status = document.getElementById("status");
    const statusMessage = document.getElementById("status-message");
    const leaveButton = document.getElementById("leave-button");
    const updates = document.getElementById("queue-updates");

    let interval = null;
    let previousPosition = null;
    let previousWait = null;

    if (!serviceId) {
        window.location.href = "join-queue.html";
        return;
    }

    function addUpdate(message) {
        const item = document.createElement("div");
        item.className = "notification";

        const strong = document.createElement("strong");
        strong.textContent = "Queue update";

        item.appendChild(strong);
        item.appendChild(document.createElement("br"));
        item.appendChild(document.createTextNode(message));

        updates.prepend(item);

        // Keep only the five most recent updates.
        while (updates.children.length > 5) {
            updates.lastElementChild.remove();
        }
    }

    async function updateStatus() {
        try {
            const result = await QueueSmart.request(
                `/api/queues/${encodeURIComponent(serviceId)}/status`
            );

            serviceName.textContent = result.serviceName;
            position.textContent = `#${result.position}`;
            waitTime.textContent = `${result.estimatedWait} minutes`;
            status.textContent = result.status || "Waiting";

            statusMessage.textContent = "";

            if (previousPosition === null) {
                addUpdate(
                    `You are currently #${result.position} in the ${result.serviceName} queue.`
                );
            } else if (previousPosition !== result.position) {
                addUpdate(
                    `Your queue position changed from #${previousPosition} to #${result.position}.`
                );
            }

            if (
                previousWait !== null &&
                previousWait !== result.estimatedWait
            ) {
                addUpdate(
                    `Your estimated wait is now ${result.estimatedWait} minutes.`
                );
            }

            previousPosition = result.position;
            previousWait = result.estimatedWait;

        } catch (error) {
            console.error("Unable to update queue status:", error);

            statusMessage.textContent =
                "Unable to refresh your queue status. Please try again.";

            // The API returns 404 when the user is no longer in the queue.
            if (error.message === "You are not in this queue.") {
                clearInterval(interval);
                localStorage.removeItem("activeQueue");

                statusMessage.textContent =
                    "You are no longer in this queue. Returning to the dashboard...";

                leaveButton.disabled = true;

                setTimeout(() => {
                    window.location.href = "dashboard.html";
                }, 2500);
            }
        }
    }

    leaveButton.addEventListener("click", async () => {
        if (!confirm("Are you sure you want to leave the queue?")) {
            return;
        }

        leaveButton.disabled = true;
        statusMessage.textContent = "Leaving queue...";

        try {
            await QueueSmart.request(
                `/api/queues/${encodeURIComponent(serviceId)}/leave`,
                { method: "DELETE" }
            );

            clearInterval(interval);
            localStorage.removeItem("activeQueue");

            statusMessage.textContent = "You have left the queue.";

            window.location.href = "dashboard.html";

        } catch (error) {
            alert(error.message);
            leaveButton.disabled = false;
            statusMessage.textContent = "";
        }
    });

    await updateStatus();

    interval = setInterval(updateStatus, 10000);
});