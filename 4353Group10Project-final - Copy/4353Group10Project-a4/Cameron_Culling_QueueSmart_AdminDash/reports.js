"use strict";

const REPORT_TOKEN_KEY = "queuesmartAdminToken";

async function reportApi(path) {
    const token = sessionStorage.getItem(REPORT_TOKEN_KEY);
    const response = await fetch(path, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
}

async function ensureReportAdmin() {
    let token = sessionStorage.getItem(REPORT_TOKEN_KEY);
    if (token) {
        try {
            const user = await reportApi("/api/me");
            if (user.role === "admin") return;
            throw new Error("Administrator access required.");
        } catch (error) {
            sessionStorage.removeItem(REPORT_TOKEN_KEY);
            if (error.message === "Administrator access required.") throw error;
        }
    }

    const email = window.prompt("Admin email:", "admin@queuesmart.local");
    if (!email) throw new Error("Sign-in cancelled.");
    const password = window.prompt("Admin password:");
    if (!password) throw new Error("Sign-in cancelled.");

    const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Unable to sign in.");
    if (result.user?.role !== "admin") throw new Error("Administrator access required.");

    sessionStorage.setItem(REPORT_TOKEN_KEY, result.token);
    sessionStorage.setItem("queueToken", result.token);
    sessionStorage.setItem("queuesmartAdminUser", JSON.stringify(result.user));
}

function showReportError(error) {
    console.error(error);
    const message = document.getElementById("reportError") || document.createElement("p");
    message.id = "reportError";
    message.className = "report-error";
    message.setAttribute("role", "alert");
    message.textContent = error.message || String(error);
    document.querySelector("main").prepend(message);
}

function clearReportError() {
    document.getElementById("reportError")?.remove();
}

function buildFilterQuery() {
    const params = new URLSearchParams();
    const startDate = document.getElementById("startDate").value;
    const endDate = document.getElementById("endDate").value;
    const serviceId = document.getElementById("serviceFilter").value;
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    if (serviceId) params.set("serviceId", serviceId);
    const query = params.toString();
    return query ? `?${query}` : "";
}

function escapeReportHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
}

function formatDate(value) {
    if (!value) return "—";
    const parsed = new Date(value.replace(" ", "T") + (value.endsWith("Z") ? "" : "Z"));
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function renderUsers(rows) {
    const target = document.getElementById("usersReport");
    if (!rows.length) {
        target.innerHTML = '<p class="empty-report">No queue participation was found for these filters.</p>';
        return;
    }
    target.innerHTML = `<table><thead><tr>
        <th>Customer</th><th>Email</th><th>Service</th><th>Joined</th><th>Ended</th><th>Wait</th><th>Outcome</th>
    </tr></thead><tbody>${rows.map(row => `<tr>
        <td>${escapeReportHtml(row.customerName)}</td>
        <td>${escapeReportHtml(row.email || "—")}</td>
        <td>${escapeReportHtml(row.serviceName)}</td>
        <td>${escapeReportHtml(formatDate(row.joinedAt))}</td>
        <td>${escapeReportHtml(formatDate(row.endedAt))}</td>
        <td>${row.waitMinutes === null ? "—" : `${Number(row.waitMinutes)} min`}</td>
        <td><span class="report-outcome ${escapeReportHtml(row.outcome)}">${escapeReportHtml(row.outcome)}</span></td>
    </tr>`).join("")}</tbody></table>`;
}

function renderServices(rows) {
    const target = document.getElementById("servicesReport");
    if (!rows.length) {
        target.innerHTML = '<p class="empty-report">No services were found.</p>';
        return;
    }
    target.innerHTML = `<table><thead><tr>
        <th>Service</th><th>Queue</th><th>Entries</th><th>Served</th><th>Left</th><th>Canceled</th><th>Waiting now</th><th>Avg. wait</th>
    </tr></thead><tbody>${rows.map(row => `<tr>
        <td><strong>${escapeReportHtml(row.serviceName)}</strong><br><small>${escapeReportHtml(row.expectedDuration)} min expected</small></td>
        <td>${escapeReportHtml(row.queueStatus)}</td>
        <td>${Number(row.totalEntries || 0)}</td>
        <td>${Number(row.usersServed || 0)}</td>
        <td>${Number(row.usersLeft || 0)}</td>
        <td>${Number(row.usersCanceled || 0)}</td>
        <td>${Number(row.currentlyWaiting || 0)}</td>
        <td>${Number(row.averageWaitMinutes || 0)} min</td>
    </tr>`).join("")}</tbody></table>`;
}

async function loadReportData() {
    clearReportError();
    const query = buildFilterQuery();
    const [overview, users, services] = await Promise.all([
        reportApi(`/api/admin/reports/overview${query}`),
        reportApi(`/api/admin/reports/users${query}`),
        reportApi(`/api/admin/reports/services${query}`)
    ]);

    document.getElementById("totalEntries").textContent = overview.totalEntries;
    document.getElementById("usersServed").textContent = overview.usersServed;
    document.getElementById("currentlyWaiting").textContent = overview.currentlyWaiting;
    document.getElementById("averageWait").textContent = overview.averageWaitMinutes;
    renderUsers(users);
    renderServices(services);
}

async function loadReportServices() {
    const services = await reportApi("/api/services");
    const select = document.getElementById("serviceFilter");
    select.innerHTML = '<option value="">All services</option>' +
        services.map(service => `<option value="${escapeReportHtml(service.id)}">${escapeReportHtml(service.name)}</option>`).join("");
}

async function exportReport(type) {
    clearReportError();
    const token = sessionStorage.getItem(REPORT_TOKEN_KEY);
    const query = buildFilterQuery();
    const separator = query ? "&" : "?";
    const response = await fetch(`/api/admin/reports/export${query}${separator}type=${encodeURIComponent(type)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Unable to export report.");
    }

    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match ? match[1] : `queuesmart-${type}-report.csv`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

document.getElementById("applyFilters").addEventListener("click", async () => {
    const start = document.getElementById("startDate").value;
    const end = document.getElementById("endDate").value;
    if (start && end && start > end) {
        showReportError(new Error("Start date cannot be after end date."));
        return;
    }
    try { await loadReportData(); } catch (error) { showReportError(error); }
});

document.getElementById("clearFilters").addEventListener("click", async () => {
    document.getElementById("startDate").value = "";
    document.getElementById("endDate").value = "";
    document.getElementById("serviceFilter").value = "";
    try { await loadReportData(); } catch (error) { showReportError(error); }
});

document.querySelectorAll("[data-export]").forEach(button => {
    button.addEventListener("click", async () => {
        try { await exportReport(button.dataset.export); }
        catch (error) { showReportError(error); }
    });
});

document.getElementById("signOutLink").addEventListener("click", async event => {
    event.preventDefault();
    const token = sessionStorage.getItem(REPORT_TOKEN_KEY);
    try {
        if (token) {
            await fetch("/api/auth/logout", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` }
            });
        }
    } finally {
        sessionStorage.removeItem(REPORT_TOKEN_KEY);
        sessionStorage.removeItem("queueToken");
        sessionStorage.removeItem("queuesmartAdminUser");
        sessionStorage.removeItem("queuesmartAdminToken");
        sessionStorage.removeItem("queueUser");
        window.location.href = "/Suyash_QueueSmart_Auth/index.html";
    }
});

(async function initReports() {
    try {
        await ensureReportAdmin();
        await loadReportServices();
        await loadReportData();
    } catch (error) {
        showReportError(error);
    }
})();
