"use strict";

const TOKEN_KEY = "queuesmartAdminToken";
const USER_KEY = "queuesmartAdminUser";
let services = [];
let queueSummaries = [];
let editingServiceId = null;

async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(path, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
}

async function ensureAdminLogin() {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (token) {
        try {
            const user = await api("/api/me");
            if (user.role === "admin") return user;
            sessionStorage.removeItem(TOKEN_KEY);
            sessionStorage.removeItem(USER_KEY);
            throw new Error("This page requires an administrator account.");
        } catch (error) {
            sessionStorage.removeItem(TOKEN_KEY);
            sessionStorage.removeItem(USER_KEY);
            if (error.message.includes("requires an administrator")) throw error;
        }
    }

    // Temporary sign-in prompt until a dedicated login page is added.
    const email = window.prompt("Admin email:", "admin@queuesmart.local");
    if (!email) throw new Error("Sign-in cancelled.");
    const password = window.prompt("Admin password:");
    if (!password) throw new Error("Sign-in cancelled.");
    const result = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
    });
    if (result.user.role !== "admin") throw new Error("This page requires an administrator account.");
    sessionStorage.setItem(TOKEN_KEY, result.token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(result.user));
    return result.user;
}

function showError(error) {
    console.error(error);
    let box = document.getElementById("apiError");
    if (!box) {
        box = document.createElement("div");
        box.id = "apiError";
        box.setAttribute("role", "alert");
        box.style.cssText = "margin:16px auto;padding:12px;border:1px solid #c33;border-radius:8px;color:#a11;max-width:1100px;";
        document.body.prepend(box);
    }
    box.textContent = error.message || String(error);
}

function clearError() {
    document.getElementById("apiError")?.remove();
}

async function loadData() {

    clearError();

    // Retrieve services
    services = await api("/api/services");

    // Retrieve queue summaries
    try {

        queueSummaries = await api("/api/admin/queues");

    } catch (error) {

        queueSummaries = [];

        console.warn(
            "Queue summary unavailable:",
            error.message
        );

        if (document.getElementById("queueService")) {
            throw error;
        }
    }

    // Update the current page
    await loadDashboard();

    loadServiceTable();

    loadQueueServices();
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
}

function getQueueCount(serviceId) {
    return queueSummaries.find(item => item.serviceId === serviceId)?.count || 0;
}

/*
==========================================
DASHBOARD
==========================================
*/

async function loadDashboard() {

    const serviceList = document.getElementById("serviceList");

    // Only run on admin.html
    if (!serviceList) {
        return;
    }

    try {

        // Retrieve statistics from the backend
        const stats = await api("/api/admin/dashboard");

        // Update dashboard statistics
        document.getElementById("totalServices").textContent =
            stats.totalServices;

        document.getElementById("openQueues").textContent =
            stats.openQueues;

        document.getElementById("peopleWaiting").textContent =
            stats.peopleWaiting;

        // Clear existing service cards
        serviceList.innerHTML = "";

        // No services available
        if (services.length === 0) {
            serviceList.innerHTML =
                "<p>No services have been created yet.</p>";

            return;
        }

        // Display each service
        services.forEach(service => {

            const queueLength = getQueueCount(service.id);

            const div = document.createElement("div");

            div.className = "queue-item";

            div.innerHTML = `
                <div class="queue-user">

                    <strong>
                        ${escapeHtml(service.name)}
                    </strong>

                    <small>
                        ${escapeHtml(service.description)}
                    </small>

                </div>

                <div>
                    <span class="badge ${service.open ? "open" : "closed"}">
                        ${service.open ? "Open" : "Closed"}
                    </span>
                </div>

                <div>
                    ${queueLength} waiting
                </div>

                <div class="queue-actions">

                    <button
                        class="button secondary"
                        onclick="toggleQueue('${encodeURIComponent(service.id)}')"
                    >
                        ${service.open ? "Close Queue" : "Open Queue"}
                    </button>

                    <a
                        class="button primary"
                        href="queue.html?service=${encodeURIComponent(service.id)}"
                    >
                        Manage
                    </a>

                </div>
            `;

            serviceList.appendChild(div);

        });

    } catch (error) {
        showError(error);
    }
}

function loadServiceTable() {
    const table = document.getElementById("serviceTable");
    if (!table) return;
    if (!services.length) { table.innerHTML = "<p>No services yet.</p>"; return; }
    table.innerHTML = `<table><thead><tr><th>Service</th><th>Duration</th><th>Priority</th><th>Actions</th></tr></thead><tbody>${services.map(service => `
        <tr><td><strong>${escapeHtml(service.name)}</strong><br><small>${escapeHtml(service.description)}</small></td>
        <td>${service.duration} min</td><td><span class="badge ${escapeHtml(service.priority)}">${escapeHtml(service.priority)}</span></td>
        <td><button class="button secondary" type="button" onclick="editService('${encodeURIComponent(service.id)}')">Edit</button>
        <button class="button danger" type="button" onclick="deleteService('${encodeURIComponent(service.id)}')">Delete</button></td></tr>`).join("")}</tbody></table>`;
}

const serviceForm = document.getElementById("serviceForm");
if (serviceForm) serviceForm.addEventListener("submit", async event => {
    event.preventDefault();
    clearError();
    const payload = {
        name: document.getElementById("serviceName").value.trim(),
        description: document.getElementById("description").value.trim(),
        duration: Number(document.getElementById("duration").value),
        priority: document.getElementById("priority").value
    };
    try {
        if (editingServiceId !== null) {
            await api(`/api/services/${encodeURIComponent(editingServiceId)}`, { method: "PATCH", body: JSON.stringify(payload) });
        } else {
            await api("/api/services", { method: "POST", body: JSON.stringify(payload) });
        }
        clearForm();
        await loadData();
        alert("Service saved successfully.");
    } catch (error) { showError(error); }
});

/*
==========================================
OPEN / CLOSE QUEUE
==========================================
*/

async function toggleQueue(encodedServiceId) {

    const serviceId = decodeURIComponent(encodedServiceId);

    const service = services.find(
        item => item.id === serviceId
    );

    if (!service) {
        return;
    }

    try {

        // Send updated queue status to backend
        await api(
            `/api/admin/services/${encodeURIComponent(serviceId)}/queue-status`,
            {
                method: "PATCH",
                body: JSON.stringify({
                    open: !service.open
                })
            }
        );

        // Reload services and dashboard
        await loadData();

    } catch (error) {
        showError(error);
    }
}

function editService(encodedId) {
    const id = decodeURIComponent(encodedId);
    const service = services.find(item => item.id === id);
    if (!service) return;
    editingServiceId = service.id;
    document.getElementById("serviceName").value = service.name;
    document.getElementById("description").value = service.description;
    document.getElementById("duration").value = service.duration;
    document.getElementById("priority").value = service.priority;
    document.getElementById("formTitle").textContent = "Edit Service";
    window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteService(encodedId) {
    const id = decodeURIComponent(encodedId);
    const service = services.find(item => item.id === id);
    if (!service || !confirm(`Delete "${service.name}"? This also removes its in-memory queue.`)) return;
    try {
        await api(`/api/services/${encodeURIComponent(id)}`, { method: "DELETE" });
        await loadData();
        clearForm();
    } catch (error) { showError(error); }
}

function clearForm() {
    const form = document.getElementById("serviceForm");
    if (form) form.reset();
    editingServiceId = null;
    const title = document.getElementById("formTitle");
    if (title) title.textContent = "Create Service";
}

function loadQueueServices() {
    const select = document.getElementById("queueService");
    if (!select) return;
    const current = new URLSearchParams(window.location.search).get("service") || select.value;
    select.innerHTML = services.map(service => `<option value="${escapeHtml(service.id)}">${escapeHtml(service.name)}</option>`).join("");
    if (services.some(service => service.id === current)) select.value = current;
    loadQueue();
}

// Queue administration is backed by the Express API; no queue data is faked in localStorage.
function loadQueue() {
    const select = document.getElementById("queueService");
    if (!select) return;
    const service = services.find(item => item.id === select.value);
    const summary = queueSummaries.find(item => item.serviceId === select.value);
    const waiting = summary?.waiting || [];
    const title = document.getElementById("queueTitle");
    const count = document.getElementById("queueCount");
    const list = document.getElementById("queueList");
    if (title) title.textContent = service ? service.name : "Queue";
    if (count) count.textContent = `${waiting.length} ${waiting.length === 1 ? "person" : "people"} waiting`;
    if (!list) return;
    if (!waiting.length) {
        list.innerHTML = "<p>No one is currently waiting in this queue.</p>";
        return;
    }
    list.innerHTML = `<table><thead><tr><th>Position</th><th>Name</th><th>Joined</th><th>Estimated wait</th><th>Action</th></tr></thead><tbody>${waiting.map((person, index) => {
        const joined = person.joinedAt ? new Date(person.joinedAt).toLocaleString() : "—";
        const wait = index * Number(service?.duration || 0);
        return `<tr><td>${index + 1}</td><td>${escapeHtml(person.name)}</td><td>${escapeHtml(joined)}</td><td>${wait} min</td><td><button class="button danger" type="button" onclick="removeUser('${encodeURIComponent(select.value)}','${encodeURIComponent(person.userId)}')">Remove</button></td></tr>`;
    }).join("")}</tbody></table>`;
}

async function refreshQueueData() {
    queueSummaries = await api("/api/admin/queues");
    loadDashboard();
    loadQueue();
}

async function serveNext() {
    const select = document.getElementById("queueService");
    if (!select?.value) return;
    try {
        await api(`/api/admin/queues/${encodeURIComponent(select.value)}/next`, { method: "DELETE" });
        clearError();
        await refreshQueueData();
    } catch (error) { showError(error); }
}

async function removeUser(encodedServiceId, encodedUserId) {
    const serviceId = decodeURIComponent(encodedServiceId);
    const userId = decodeURIComponent(encodedUserId);
    if (!confirm("Remove this person from the queue?")) return;
    try {
        await api(`/api/admin/queues/${encodeURIComponent(serviceId)}/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
        clearError();
        await refreshQueueData();
    } catch (error) { showError(error); }
}

// Queue reordering is not supported by the current backend API.
function moveUserUp() { showError(new Error("Queue reordering is not supported yet.")); }
function moveUserDown() { showError(new Error("Queue reordering is not supported yet.")); }

(async function init() {
    try {
        await ensureAdminLogin();
        await loadData();
    } catch (error) {
        showError(error);
    }
})();