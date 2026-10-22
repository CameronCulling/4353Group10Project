# QueueSmart — Express backend

## Requirements
- Node.js 18 or newer
- npm

## Run locally
```bash
npm install
npm start
```
Open http://localhost:3000 (dashboard), http://localhost:3000/services.html, or http://localhost:3000/queue.html.
Do not open the HTML files directly with `file://`; use the Express server so API calls work.

## Tests and coverage
```bash
npm test
npm run test:coverage
```
The test suite uses Node's built-in test runner. `c8` creates text and HTML coverage reports (`coverage/index.html`).

## Validation rules
- `name`: required string, trimmed, maximum 100 characters
- `description`: required string, trimmed, maximum 500 characters
- `duration`: required integer from 1 to 1440 minutes
- `priority`: required value `low`, `medium`, or `high`
- IDs must be positive integers
- Queue status `open` must be a boolean

Invalid request bodies return HTTP 400 with an `error` message and field-level `details`. Missing resources return 404. Serving an empty queue returns 409.

## API overview
- `GET /api/health`
- `GET /api/services`, `GET /api/services/:id`
- `POST /api/services`, `PUT /api/services/:id`
- `PATCH /api/services/:id/queue-status` with `{ "open": true }`
- `GET /api/queues`, `GET /api/queues/:serviceId`
- `POST /api/queues/:serviceId/serve-next`
- `PATCH /api/queues/:serviceId/:userId/move` with `{ "direction": "up" }` or `{ "direction": "down" }`
- `DELETE /api/queues/:serviceId/:userId`

Data is stored in server memory only and resets whenever the server restarts.
