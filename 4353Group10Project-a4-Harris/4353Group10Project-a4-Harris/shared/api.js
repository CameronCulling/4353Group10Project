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

            window.location.href = "/admin.html";
        } else {
            sessionStorage.removeItem("queuesmartAdminToken");

            window.location.href =
                "/Harris_Khan_QueueSmart_userdash/dashboard.html";
        }
    },

    clearSession() {
        sessionStorage.removeItem("queueToken");
        sessionStorage.removeItem("queueUser");
        seesionStorage.removeItem("queuesmartAdminToken");
    }
};