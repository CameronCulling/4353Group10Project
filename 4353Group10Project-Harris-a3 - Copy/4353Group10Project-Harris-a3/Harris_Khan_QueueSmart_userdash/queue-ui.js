document.addEventListener("DOMContentLoaded", () => {

    const serviceSelect = document.getElementById("service");
    const waitDisplay = document.getElementById("wait-display");
    const queueForm = document.getElementById("queue-form");

    if (!serviceSelect || !queueForm) return;

    serviceSelect.addEventListener("change", async () => {

        const serviceId = serviceSelect.value;

        try {
            const result = await QueueSmart.request(
                `/api/queues/${serviceId}/estimate`
            );

            waitDisplay.textContent =
                `Approximately ${result.estimatedWait} minutes`;

        } catch (error) {
            waitDisplay.textContent = error.message;
        }
    });

    queueForm.addEventListener("submit", async event => {

        event.preventDefault();

        if (!queueForm.reportValidity()) return;

        const serviceId = serviceSelect.value;

        try {
            const result = await QueueSmart.request(
                `/api/queues/${serviceId}/join`,
                { method: "POST" }
            );

            localStorage.setItem(
                "activeQueue",
                result.serviceId
            );

            window.location.href = "queue-status.html";

        } catch (error) {
            alert(error.message);
        }
    });
});