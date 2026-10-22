const express = require("express");
const path = require("path");
const { validateService, parseId } = require("./validation");

const app = express();
app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));

const initialServices = [
  { id: 1, name: "DMV Services", description: "Apply for or renew a driver's license.", duration: 30, priority: "high", open: true },
  { id: 2, name: "Student Advising", description: "Academic advising for students.", duration: 20, priority: "medium", open: true },
  { id: 3, name: "Financial Aid", description: "Ask questions and receive general assistance regarding financial services.", duration: 10, priority: "low", open: false }
];
const initialQueues = {
  1: [
    { id: 101, name: "John Smith", number: "A001" },
    { id: 102, name: "Sarah Johnson", number: "A002" },
    { id: 103, name: "Michael Brown", number: "A003" }
  ],
  2: [
    { id: 201, name: "Emily Davis", number: "B001" },
    { id: 202, name: "David Wilson", number: "B002" }
  ],
  3: [{ id: 301, name: "Robert Taylor", number: "C001" }]
};
let services = structuredClone(initialServices);
let queues = structuredClone(initialQueues);
let nextServiceId = 4;

function resetData() {
  services = structuredClone(initialServices);
  queues = structuredClone(initialQueues);
  nextServiceId = 4;
}
function findService(id) { return services.find(service => service.id === id); }
function apiError(res, status, message, errors) {
  const body = { error: message };
  if (errors) body.details = errors;
  return res.status(status).json(body);
}

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.get("/api/services", (_req, res) => res.json({ services }));
app.get("/api/services/:id", (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return apiError(res, 400, "Service id must be a positive integer.");
  const service = findService(id);
  if (!service) return apiError(res, 404, "Service not found.");
  return res.json({ service });
});

app.post("/api/services", (req, res) => {
  const validation = validateService(req.body);
  if (!validation.valid) return apiError(res, 400, "Validation failed.", validation.errors);
  const service = {
    id: nextServiceId++,
    name: req.body.name.trim(),
    description: req.body.description.trim(),
    duration: req.body.duration,
    priority: req.body.priority,
    open: false
  };
  services.push(service);
  queues[service.id] = [];
  return res.status(201).json({ service });
});

app.put("/api/services/:id", (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return apiError(res, 400, "Service id must be a positive integer.");
  const service = findService(id);
  if (!service) return apiError(res, 404, "Service not found.");
  const validation = validateService(req.body);
  if (!validation.valid) return apiError(res, 400, "Validation failed.", validation.errors);
  Object.assign(service, {
    name: req.body.name.trim(),
    description: req.body.description.trim(),
    duration: req.body.duration,
    priority: req.body.priority
  });
  return res.json({ service });
});

app.patch("/api/services/:id/queue-status", (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return apiError(res, 400, "Service id must be a positive integer.");
  const service = findService(id);
  if (!service) return apiError(res, 404, "Service not found.");
  if (typeof req.body.open !== "boolean") {
    return apiError(res, 400, "Validation failed.", [{ field: "open", message: "open must be a boolean." }]);
  }
  service.open = req.body.open;
  return res.json({ service });
});

app.get("/api/queues", (_req, res) => res.json({ queues }));
app.get("/api/queues/:serviceId", (req, res) => {
  const serviceId = parseId(req.params.serviceId);
  if (!serviceId) return apiError(res, 400, "Service id must be a positive integer.");
  if (!findService(serviceId)) return apiError(res, 404, "Service not found.");
  return res.json({ serviceId, queue: queues[serviceId] || [] });
});

app.post("/api/queues/:serviceId/serve-next", (req, res) => {
  const serviceId = parseId(req.params.serviceId);
  if (!serviceId) return apiError(res, 400, "Service id must be a positive integer.");
  if (!findService(serviceId)) return apiError(res, 404, "Service not found.");
  const queue = queues[serviceId] || [];
  if (!queue.length) return apiError(res, 409, "There are no users waiting.");
  const served = queue.shift();
  return res.json({ served, queue });
});

app.patch("/api/queues/:serviceId/:userId/move", (req, res) => {
  const serviceId = parseId(req.params.serviceId);
  const userId = parseId(req.params.userId);
  if (!serviceId || !userId) return apiError(res, 400, "Service and user ids must be positive integers.");
  if (!findService(serviceId)) return apiError(res, 404, "Service not found.");
  const direction = req.body.direction;
  if (!["up", "down"].includes(direction)) {
    return apiError(res, 400, "Validation failed.", [{ field: "direction", message: 'direction must be "up" or "down".' }]);
  }
  const queue = queues[serviceId] || [];
  const index = queue.findIndex(user => user.id === userId);
  if (index < 0) return apiError(res, 404, "Queue user not found.");
  const target = direction === "up" ? index - 1 : index + 1;
  if (target >= 0 && target < queue.length) {
    [queue[index], queue[target]] = [queue[target], queue[index]];
  }
  return res.json({ queue });
});

app.delete("/api/queues/:serviceId/:userId", (req, res) => {
  const serviceId = parseId(req.params.serviceId);
  const userId = parseId(req.params.userId);
  if (!serviceId || !userId) return apiError(res, 400, "Service and user ids must be positive integers.");
  if (!findService(serviceId)) return apiError(res, 404, "Service not found.");
  const queue = queues[serviceId] || [];
  const index = queue.findIndex(user => user.id === userId);
  if (index < 0) return apiError(res, 404, "Queue user not found.");
  const [removed] = queue.splice(index, 1);
  return res.json({ removed, queue });
});

// Malformed JSON is a client error, rather than an unhandled server error.
app.use((err, _req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return apiError(res, 400, "Request body contains invalid JSON.");
  }
  return next(err);
});

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => console.log(`QueueSmart running at http://localhost:${port}`));
}

module.exports = { app, resetData };
