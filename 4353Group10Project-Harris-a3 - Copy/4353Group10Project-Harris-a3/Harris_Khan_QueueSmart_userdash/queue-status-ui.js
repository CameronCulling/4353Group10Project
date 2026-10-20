document.addEventListener("DOMContentLoaded", async () => {

    const serviceId = localStorage.getItem("activeQueue");

    const serviceName = document.getElementById("service-name");
    const position = document.getElementById("position");
    const waitTime = document.getElementById("wait-time");
    const leaveButton = document.getElementById("leave-button");

    if (!serviceId) {
        window.location.href = "join-queue.html";
        return;
    }

    async function updateStatus() {
        try {
            const result = await QueueSmart.request(
                `/api/queues/${serviceId}/status`
            );

            serviceName.textContent = result.serviceName;
            position.textContent = `#${result.position}`;
            waitTime.textContent =
                `${result.estimatedWait} minutes`;

        } catch (error) {
            console.error(error.message);
        }
    }

    await updateStatus();

    const interval = setInterval(updateStatus, 10000);

    leaveButton.addEventListener("click", async () => {

        if (!confirm("Are you sure you want to leave the queue?")) {
            return;
        }

        try {
            await QueueSmart.request(
                `/api/queues/${serviceId}/leave`,
                { method: "DELETE" }
            );

            clearInterval(interval);

            localStorage.removeItem("activeQueue");

            window.location.href = "dashboard.html";

        } catch (error) {
            alert(error.message);
        }
    });
});