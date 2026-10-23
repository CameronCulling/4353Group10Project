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

    saveSession(result) {
        sessionStorage.setItem(
            "queueToken",
            result.token
        );

        sessionStorage.setItem(
            "queueUser",
            JSON.stringify(result.user)
        );

        window.location.href =
            "/Harris_Khan_QueueSmart_userdash/dashboard.html";
    },

    clearSession() {
        sessionStorage.removeItem("queueToken");
        sessionStorage.removeItem("queueUser");
    }
};