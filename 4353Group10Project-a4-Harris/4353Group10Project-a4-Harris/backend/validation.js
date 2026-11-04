function registrationError(body) {
    if (!body || typeof body !== "object" ||
        Array.isArray(body)) {
        return "Request body must be an object.";
    }

    if (typeof body.name !== "string" ||
        body.name.trim().length === 0) {
        return "Name is required.";
    }

    if (body.name.trim().length > 80) {
        return "Name cannot exceed 80 characters.";
    }

    if (typeof body.email !== "string" ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) ||
        body.email.length > 254) {
        return "Email must be valid.";
    }

    if (typeof body.password !== "string" ||
        body.password.length < 8 ||
        body.password.length > 72) {
        return "Password must contain 8–72 characters.";
    }

    if (body.role !== undefined && body.role !== "user") {
        return "Users can only register as regular users.";
    }

    return null;
}

function loginError(body) {
    if (!body || typeof body !== "object" ||
        Array.isArray(body)) {
        return "Request body must be an object.";
    }

    if (typeof body.email !== "string" ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) ||
        body.email.length > 254) {
        return "Email must be valid.";
    }

    if (typeof body.password !== "string" ||
        body.password.length === 0 ||
        body.password.length > 72) {
        return "Password is required and must not exceed 72 characters.";
    }

    return null;
}

module.exports = {
    registrationError,
    loginError
};