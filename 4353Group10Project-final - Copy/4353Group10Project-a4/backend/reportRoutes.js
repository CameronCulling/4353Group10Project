"use strict";

function registerReportRoutes(app, fail, auth, db) {
    function requireAdmin(req, res, next) {
        if (!req.user || req.user.role !== "admin") {
            return fail(res, 403, "Administrator access required.");
        }
        next();
    }

    const admin = [auth, requireAdmin];

    function validDate(value) {
        if (value === undefined || value === "") return true;
        if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            return false;
        }
        const parsed = new Date(`${value}T00:00:00.000Z`);
        return !Number.isNaN(parsed.getTime()) &&
            parsed.toISOString().slice(0, 10) === value;
    }

    function getFilters(req, res) {
        const { startDate, endDate, serviceId } = req.query;

        if (!validDate(startDate) || !validDate(endDate)) {
            fail(res, 400, "Dates must use the YYYY-MM-DD format.");
            return null;
        }
        if (startDate && endDate && startDate > endDate) {
            fail(res, 400, "Start date cannot be after end date.");
            return null;
        }
        if (serviceId !== undefined &&
            (typeof serviceId !== "string" || !serviceId.trim() || serviceId.length > 100)) {
            fail(res, 400, "Invalid service ID.");
            return null;
        }

        return { startDate, endDate, serviceId };
    }

    function historyConditions(filters, alias = "h") {
        const conditions = [];
        const params = [];
        if (filters.startDate) {
            conditions.push(`date(${alias}.joined_at) >= date(?)`);
            params.push(filters.startDate);
        }
        if (filters.endDate) {
            conditions.push(`date(${alias}.joined_at) <= date(?)`);
            params.push(filters.endDate);
        }
        if (filters.serviceId) {
            conditions.push(`${alias}.service_id = ?`);
            params.push(filters.serviceId);
        }
        return {
            sql: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
            params
        };
    }

    function getOverview(filters) {
        const where = historyConditions(filters);
        const activity = db.prepare(`
            SELECT
                COUNT(*) AS totalEntries,
                COUNT(DISTINCT h.user_id) AS usersParticipated,
                SUM(CASE WHEN h.outcome = 'served' THEN 1 ELSE 0 END) AS usersServed,
                SUM(CASE WHEN h.outcome = 'left' THEN 1 ELSE 0 END) AS usersLeft,
                SUM(CASE WHEN h.outcome = 'canceled' THEN 1 ELSE 0 END) AS usersCanceled,
                SUM(CASE WHEN h.outcome = 'waiting' THEN 1 ELSE 0 END) AS historyStillWaiting,
                ROUND(AVG(CASE WHEN h.outcome != 'waiting' THEN h.wait_minutes END), 2) AS averageWaitMinutes
            FROM History h
            ${where.sql}
        `).get(...where.params);

        const current = db.prepare(`
            SELECT
                (SELECT COUNT(*) FROM Service
                 ${filters.serviceId ? "WHERE service_id = ?" : ""}) AS totalServices,
                (SELECT COUNT(*) FROM Queue q
                 ${filters.serviceId ? "WHERE q.service_id = ? AND q.status = 'open'" : "WHERE q.status = 'open'"}) AS openQueues,
                (SELECT COUNT(*) FROM QueueEntry e
                 JOIN Queue q ON q.queue_id = e.queue_id
                 ${filters.serviceId ? "WHERE q.service_id = ? AND e.status = 'waiting'" : "WHERE e.status = 'waiting'"}) AS currentlyWaiting
        `).get(
            ...(filters.serviceId ? [filters.serviceId, filters.serviceId, filters.serviceId] : [])
        );

        return {
            ...activity,
            totalEntries: Number(activity.totalEntries || 0),
            usersParticipated: Number(activity.usersParticipated || 0),
            usersServed: Number(activity.usersServed || 0),
            usersLeft: Number(activity.usersLeft || 0),
            usersCanceled: Number(activity.usersCanceled || 0),
            historyStillWaiting: Number(activity.historyStillWaiting || 0),
            averageWaitMinutes: activity.averageWaitMinutes === null
                ? 0 : Number(activity.averageWaitMinutes),
            totalServices: Number(current.totalServices || 0),
            openQueues: Number(current.openQueues || 0),
            currentlyWaiting: Number(current.currentlyWaiting || 0)
        };
    }

    function getUsersReport(filters) {
        const where = historyConditions(filters);
        return db.prepare(`
            SELECT
                h.history_id AS historyId,
                h.user_id AS userId,
                COALESCE(p.full_name, 'Unknown user') AS customerName,
                c.email,
                h.service_id AS serviceId,
                h.service_name AS serviceName,
                h.joined_at AS joinedAt,
                h.ended_at AS endedAt,
                CASE WHEN h.outcome = 'waiting' THEN NULL ELSE h.wait_minutes END AS waitMinutes,
                h.outcome
            FROM History h
            LEFT JOIN UserCredentials c ON c.user_id = h.user_id
            LEFT JOIN UserProfile p ON p.user_id = h.user_id
            ${where.sql}
            ORDER BY h.joined_at DESC, h.history_id DESC
        `).all(...where.params);
    }

    function getServicesReport(filters) {
        const conditions = [];
        const params = [];
        if (filters.serviceId) {
            conditions.push("s.service_id = ?");
            params.push(filters.serviceId);
        }
        let historyDateConditions = "";
        const historyParams = [];
        if (filters.startDate) {
            historyDateConditions += " AND date(h.joined_at) >= date(?)";
            historyParams.push(filters.startDate);
        }
        if (filters.endDate) {
            historyDateConditions += " AND date(h.joined_at) <= date(?)";
            historyParams.push(filters.endDate);
        }
        return db.prepare(`
            SELECT
                s.service_id AS serviceId,
                s.service_name AS serviceName,
                s.description,
                s.expected_duration AS expectedDuration,
                s.priority_level AS priority,
                (SELECT q.status FROM Queue q
                 WHERE q.service_id = s.service_id
                 ORDER BY q.created_date DESC, q.queue_id DESC LIMIT 1) AS queueStatus,
                COUNT(h.history_id) AS totalEntries,
                SUM(CASE WHEN h.outcome = 'served' THEN 1 ELSE 0 END) AS usersServed,
                SUM(CASE WHEN h.outcome = 'left' THEN 1 ELSE 0 END) AS usersLeft,
                SUM(CASE WHEN h.outcome = 'canceled' THEN 1 ELSE 0 END) AS usersCanceled,
                SUM(CASE WHEN h.outcome = 'waiting' THEN 1 ELSE 0 END) AS historyStillWaiting,
                ROUND(AVG(CASE WHEN h.outcome != 'waiting' THEN h.wait_minutes END), 2) AS averageWaitMinutes,
                (SELECT COUNT(*)
                 FROM Queue q2 JOIN QueueEntry e ON e.queue_id = q2.queue_id
                 WHERE q2.service_id = s.service_id AND e.status = 'waiting') AS currentlyWaiting
            FROM Service s
            LEFT JOIN History h
                ON h.service_id = s.service_id ${historyDateConditions}
            ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
            GROUP BY s.service_id
            ORDER BY s.service_name COLLATE NOCASE
        `).all(...historyParams, ...params).map(row => ({
            ...row,
            totalEntries: Number(row.totalEntries || 0),
            usersServed: Number(row.usersServed || 0),
            usersLeft: Number(row.usersLeft || 0),
            usersCanceled: Number(row.usersCanceled || 0),
            historyStillWaiting: Number(row.historyStillWaiting || 0),
            averageWaitMinutes: row.averageWaitMinutes === null
                ? 0 : Number(row.averageWaitMinutes),
            currentlyWaiting: Number(row.currentlyWaiting || 0),
            queueStatus: row.queueStatus || "not created"
        }));
    }

    function csvCell(value) {
        let text = value === null || value === undefined ? "" : String(value);
        // Prevent spreadsheet formula execution when opening exported CSV files.
        if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
        return `"${text.replace(/"/g, '""')}"`;
    }

    function toCsv(rows, columns) {
        return [
            columns.map(column => csvCell(column.label)).join(","),
            ...rows.map(row => columns.map(column => csvCell(row[column.key])).join(","))
        ].join("\r\n") + "\r\n";
    }

    function sendCsv(res, name, rows, columns) {
        const csv = "\uFEFF" + toCsv(rows, columns);
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
        return res.send(csv);
    }

    app.get("/api/admin/reports/overview", ...admin, (req, res) => {
        const filters = getFilters(req, res);
        if (!filters) return;
        try {
            return res.json(getOverview(filters));
        } catch (error) {
            console.error("Report overview error:", error);
            return fail(res, 500, "Unable to generate report overview.");
        }
    });

    app.get("/api/admin/reports/users", ...admin, (req, res) => {
        const filters = getFilters(req, res);
        if (!filters) return;
        try {
            return res.json(getUsersReport(filters));
        } catch (error) {
            console.error("User report error:", error);
            return fail(res, 500, "Unable to generate user participation report.");
        }
    });

    app.get("/api/admin/reports/services", ...admin, (req, res) => {
        const filters = getFilters(req, res);
        if (!filters) return;
        try {
            return res.json(getServicesReport(filters));
        } catch (error) {
            console.error("Service report error:", error);
            return fail(res, 500, "Unable to generate service activity report.");
        }
    });

    app.get("/api/admin/reports/export", ...admin, (req, res) => {
        const filters = getFilters(req, res);
        if (!filters) return;
        const type = req.query.type || "users";
        try {
            if (type === "users") {
                return sendCsv(res, "queuesmart-user-participation.csv",
                    getUsersReport(filters), [
                        { key: "userId", label: "User ID" },
                        { key: "customerName", label: "Customer Name" },
                        { key: "email", label: "Email" },
                        { key: "serviceName", label: "Service" },
                        { key: "joinedAt", label: "Joined At" },
                        { key: "endedAt", label: "Ended At" },
                        { key: "waitMinutes", label: "Wait Minutes" },
                        { key: "outcome", label: "Outcome" }
                    ]);
            }
            if (type === "services") {
                return sendCsv(res, "queuesmart-service-activity.csv",
                    getServicesReport(filters), [
                        { key: "serviceId", label: "Service ID" },
                        { key: "serviceName", label: "Service Name" },
                        { key: "description", label: "Description" },
                        { key: "expectedDuration", label: "Expected Duration (minutes)" },
                        { key: "priority", label: "Priority" },
                        { key: "queueStatus", label: "Queue Status" },
                        { key: "totalEntries", label: "Total Queue Entries" },
                        { key: "usersServed", label: "Users Served" },
                        { key: "usersLeft", label: "Users Left" },
                        { key: "usersCanceled", label: "Users Canceled" },
                        { key: "currentlyWaiting", label: "Currently Waiting" },
                        { key: "averageWaitMinutes", label: "Average Wait (minutes)" }
                    ]);
            }
            if (type === "overview") {
                return sendCsv(res, "queuesmart-queue-overview.csv",
                    [getOverview(filters)], [
                        { key: "totalServices", label: "Total Services" },
                        { key: "openQueues", label: "Open Queues" },
                        { key: "totalEntries", label: "Total Queue Entries" },
                        { key: "usersParticipated", label: "Users Participated" },
                        { key: "usersServed", label: "Users Served" },
                        { key: "usersLeft", label: "Users Left" },
                        { key: "usersCanceled", label: "Users Canceled" },
                        { key: "currentlyWaiting", label: "Currently Waiting" },
                        { key: "averageWaitMinutes", label: "Average Wait (minutes)" }
                    ]);
            }
            return fail(res, 400, "Report type must be users, services, or overview.");
        } catch (error) {
            console.error("Report export error:", error);
            return fail(res, 500, "Unable to export report.");
        }
    });
}

module.exports = { registerReportRoutes };
