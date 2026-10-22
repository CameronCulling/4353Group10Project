const PRIORITIES = new Set(["low", "medium", "high"]);

function validateService(input, { partial = false } = {}) {
  const errors = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { valid: false, errors: [{ field: "body", message: "Request body must be a JSON object." }] };
  }

  const required = ["name", "description", "duration", "priority"];
  if (!partial) {
    for (const field of required) {
      if (input[field] === undefined || input[field] === null || input[field] === "") {
        errors.push({ field, message: `${field} is required.` });
      }
    }
  }

  if (input.name !== undefined) {
    if (typeof input.name !== "string") errors.push({ field: "name", message: "Name must be a string." });
    else {
      if (!input.name.trim()) errors.push({ field: "name", message: "Name is required." });
      if (input.name.trim().length > 100) errors.push({ field: "name", message: "Name must be 100 characters or fewer." });
    }
  }
  if (input.description !== undefined) {
    if (typeof input.description !== "string") errors.push({ field: "description", message: "Description must be a string." });
    else {
      if (!input.description.trim()) errors.push({ field: "description", message: "Description is required." });
      if (input.description.trim().length > 500) errors.push({ field: "description", message: "Description must be 500 characters or fewer." });
    }
  }
  if (input.duration !== undefined) {
    if (typeof input.duration !== "number" || !Number.isFinite(input.duration)) {
      errors.push({ field: "duration", message: "Duration must be a number." });
    } else if (!Number.isInteger(input.duration) || input.duration < 1 || input.duration > 1440) {
      errors.push({ field: "duration", message: "Duration must be a whole number from 1 to 1440 minutes." });
    }
  }
  if (input.priority !== undefined) {
    if (typeof input.priority !== "string" || !PRIORITIES.has(input.priority)) {
      errors.push({ field: "priority", message: 'Priority must be "low", "medium", or "high".' });
    }
  }
  return { valid: errors.length === 0, errors };
}

function parseId(value) {
  if (!/^\d+$/.test(String(value))) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

module.exports = { validateService, parseId };
