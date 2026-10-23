document.addEventListener("DOMContentLoaded", async () => {
    const serviceSelect = document.getElementById("service");
    const waitDisplay = document.getElementById("wait-display");
    const queueForm = document.getElementById("queue-form");

    if (!serviceSelect || !queueForm) return;

    // Load available services from the backend.
    async function loadServices() {
        serviceSelect.innerHTML =
            '<option value="" selected disabled>Loading services...</option>';

        try {
            const services = await QueueSmart.request("/api/services");

            // Only show services that are open.
            const openServices = services.filter(
                service => service.open === true
            );

            serviceSelect.innerHTML =
                '<option value="" selected disabled>Select a service</option>';

            if (openServices.length === 0) {
                serviceSelect.innerHTML =
                    '<option value="" selected disabled>No open services available</option>';

                waitDisplay.textContent =
                    "There are currently no open services.";

                return;
            }

            openServices.forEach(service => {
                const option = document.createElement("option");

                option.value = service.id;
                option.textContent = service.name;

                serviceSelect.appendChild(option);
            });

        } catch (error) {
            serviceSelect.innerHTML =
                '<option value="" selected disabled>Unable to load services</option>';

            waitDisplay.textContent = error.message;
        }
    }

    // Display the estimated wait for the selected service.
    serviceSelect.addEventListener("change", async () => {
        const serviceId = serviceSelect.value;

        if (!serviceId) return;

        waitDisplay.textContent = "Calculating estimated wait...";

        try {
            const result = await QueueSmart.request(
                `/api/queues/${encodeURIComponent(serviceId)}/estimate`
            );

            waitDisplay.textContent =
                `Approximately ${result.estimatedWait} minutes`;

        } catch (error) {
            waitDisplay.textContent = error.message;
        }
    });

    // Join the selected service's queue.
    queueForm.addEventListener("submit", async event => {
        event.preventDefault();

        if (!queueForm.reportValidity()) return;

        const serviceId = serviceSelect.value;

        if (!serviceId) {
            waitDisplay.textContent = "Please select a service.";
            return;
        }

        try {
            const result = await QueueSmart.request(
                `/api/queues/${encodeURIComponent(serviceId)}/join`,
                { method: "POST" }
            );

            localStorage.setItem("activeQueue", result.serviceId);

            window.location.href = "queue-status.html";

        } catch (error) {
            alert(error.message);
        }
    });

    await loadServices();
});