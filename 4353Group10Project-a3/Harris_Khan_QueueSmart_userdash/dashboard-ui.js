document.addEventListener("DOMContentLoaded", async () => {
    const serviceList = document.getElementById("service-list");

    const currentPosition = document.getElementById("current-position");
    const currentService = document.getElementById("current-service");
    const currentWait = document.getElementById("current-wait");
    const currentStatus = document.getElementById("current-status");
    const statusDescription = document.getElementById("status-description");

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[char]);
    }

    // Load available services and their estimated waits.
    async function loadDashboardServices() {
        if (!serviceList) return;

        serviceList.innerHTML = "<p>Loading services...</p>";

        try {
            const services = await QueueSmart.request("/api/services");

            const openServices = services.filter(
                service => service.open === true
            );

            if (openServices.length === 0) {
                serviceList.innerHTML =
                    "<p>There are currently no open services.</p>";
                return;
            }

            serviceList.innerHTML = "";

            for (const service of openServices) {
                const item = document.createElement("div");
                item.className = "service-item";

                let estimatedWait = "Unavailable";

                try {
                    const estimate = await QueueSmart.request(
                        `/api/queues/${encodeURIComponent(service.id)}/estimate`
                    );

                    estimatedWait = `${estimate.estimatedWait} minutes`;
                } catch (error) {
                    console.error(
                        `Unable to estimate wait for ${service.name}:`,
                        error
                    );
                }

                item.innerHTML = `
                    <div>
                        <div class="service-name">
                            ${escapeHtml(service.name)}
                        </div>
                        <div class="service-wait">
                            Estimated wait: ${escapeHtml(estimatedWait)}
                        </div>
                    </div>
                    <a href="join-queue.html">Join</a>
                `;

                serviceList.appendChild(item);
            }
        } catch (error) {
            console.error("Unable to load services:", error);
            serviceList.innerHTML =
                `<p>Unable to load services: ${escapeHtml(error.message)}</p>`;
        }
    }

    // Load the user's active queue information.
    async function loadCurrentQueue() {
        const serviceId = localStorage.getItem("activeQueue");

        if (!serviceId) {
            currentPosition.textContent = "--";
            currentService.textContent = "No active queue";
            currentWait.textContent = "--";
            currentStatus.textContent = "Not in queue";
            statusDescription.textContent =
                "Join a service to get started.";
            return;
        }

        try {
            const result = await QueueSmart.request(
                `/api/queues/${encodeURIComponent(serviceId)}/status`
            );

            currentPosition.textContent = `#${result.position}`;
            currentService.textContent = result.serviceName;
            currentWait.textContent = `${result.estimatedWait} min`;

            const queueStatus = result.status || "waiting";

            currentStatus.textContent =
                queueStatus.charAt(0).toUpperCase() +
                queueStatus.slice(1);

            statusDescription.textContent =
                queueStatus.toLowerCase() === "waiting"
                    ? "You're currently waiting in this queue."
                    : "Your queue status has been updated.";

        } catch (error) {
            console.error("Unable to load current queue:", error);

            currentPosition.textContent = "--";
            currentService.textContent = "Queue unavailable";
            currentWait.textContent = "--";
            currentStatus.textContent = "Unavailable";
            statusDescription.textContent =
                "Unable to retrieve your queue status.";
        }
    }

    await Promise.all([
        loadDashboardServices(),
        loadCurrentQueue()
    ]);
});