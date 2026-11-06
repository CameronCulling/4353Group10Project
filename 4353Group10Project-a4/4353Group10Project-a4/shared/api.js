window.QueueSmart = {
    async request(path, options = {}) {
        const token = sessionStorage.getItem("queueToken");

        const headers = {
            ...options.headers
        };

        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }

        if (options.body !== undefined) {
            headers["Content-Type"] = "application/json";
        }

        const response = await fetch(path, {
            ...options,
            headers
        });

        const data = await response.json().catch(() => null);

        if (!response.ok) {
            throw new Error(
                data?.error || "Request failed."
            );
        }

        return data;
    },

    // Keep each account's active queue separate. localStorage is shared
    // across tabs, so the logged-in user ID must be part of the key.
    getActiveQueueKey() {
        const user = JSON.parse(sessionStorage.getItem("queueUser") || "null");
        if (!user || !user.id) return null;
        return `activeQueue:${user.id}`;
    },

    getActiveQueue() {
        const key = this.getActiveQueueKey();
        return key ? localStorage.getItem(key) : null;
    },

    setActiveQueue(serviceId) {
        const key = this.getActiveQueueKey();
        if (!key) throw new Error("Your session has expired. Please log in again.");
        localStorage.setItem(key, serviceId);
    },

    clearActiveQueue() {
        const key = this.getActiveQueueKey();
        if (key) localStorage.removeItem(key);
    },

    saveSession(result) {
     // Store the authentication token
        sessionStorage.setItem(
            "queueToken",
            result.token
        );

    // Store the logged-in user's information
        sessionStorage.setItem(
            "queueUser",
            JSON.stringify(result.user)
        );

    // Redirect based on account role
        if (result.user.role === "admin") {
            sessionStorage.setItem(
                "queuesmartAdminToken",
                result.token
            );

            window.location.href = "../Cameron_Culling_QueueSmart_AdminDash/admin.html";
        } else {
            sessionStorage.removeItem("queuesmartAdminToken");

            window.location.href =
                "/Harris_Khan_QueueSmart_userdash/dashboard.html";
        }
    },

    clearSession() {
        sessionStorage.removeItem("queueToken");
        sessionStorage.removeItem("queueUser");
        sessionStorage.removeItem("queuesmartAdminToken");
    }
};