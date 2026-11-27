# Final assignment: administrator access and integration

## Changes
- `adminAccess.js`: centralized authentication and role check for `/api/admin` and every subroute. Unauthenticated requests receive HTTP 401; authenticated non-admin users receive HTTP 403. Admin requests continue to the existing handler. The middleware sets `Cache-Control: no-store` on admin API responses.
- `app.js`: import the protection helper and mount it immediately after creating the existing `auth` middleware, before any API route registrations. Existing per-route authorization is left intact for compatibility. Service routes outside `/api/admin` retain their existing role checks.
- `tests/adminAccess.test.js`: four isolated tests of the middleware.
- `tests/finalIntegration.test.js`: four HTTP integration scenarios, including forged/revoked sessions, role escalation, live database role checks, and persistence of accounts, services, queue entries, history and notifications across database close/reopen. All tests use temporary or in-memory databases and synthetic accounts.
- `tests/final-report-contract.js`: explicitly run after the reporting feature is merged; verifies admin-only access, JSON reporting and downloadable CSV output. This intentionally does not run in the pre-merge `npm test` suite because its filename does not end in `.test.js`.

## Reporting team integration contract

Register all report API endpoints beneath `/api/admin` and after the middleware in `app.js`. Suggested endpoints: `GET /api/admin/reports` and `GET /api/admin/reports/export` (CSV). Use the existing Bearer token in the frontend fetch request; client-side UI checks alone do not enforce access. Do not expose an alternate unprotected download endpoint or store generated reports in a public static directory. Do not include credentials or password hashes in reports. If the team picks different endpoints, update the contract test or set `QUEUESMART_REPORT_PATH` and `QUEUESMART_EXPORT_PATH` for the explicit test. The sample test assumes JSON for the report and CSV with Content-Disposition: attachment for the export; adapt it if the team chooses PDF or another contract. Existing admin HTML pages are static; the protection here applies to API data, not static HTML navigation.

## Verification on your computer (Node.js 22.13+ or current LTS with node:sqlite)
From the backend directory:

```sh
npm ci
node --test tests/adminAccess.test.js
node --test tests/finalIntegration.test.js
npm test
npm run coverage
```

After reporting is merged:

```sh
node --test tests/final-report-contract.js
npm run coverage
```

`npm run coverage` uses Node's built-in coverage and existing test glob. Capture the actual overall backend line coverage, test count and results after all feature branches are merged. Aim for at least 80% per the assignment; no full-project coverage percentage has been established by this package. The isolated guard test was run with Node 22.16.0: four tests passed; guard file line/branch/function coverage was 100%. The new HTTP tests were syntax checked but not executed because Express was not available in the build environment. No database file was altered. No GitHub commits were made by the assistant.

## Demo checklist
1. Open an admin dashboard with an authenticated administrator.
2. Show an anonymous request to an admin API returning 401 and a regular user's request returning 403; an admin request succeeds.
3. After reporting merges, demonstrate the same access policy for JSON report and CSV download.
4. Register a test account, create/open a service as administrator, and join as a user.
5. Stop and restart the server with the same SQLite file. Log in again (session tokens are in memory by design), verify the queue entry and user history still exist, then serve the user.
6. Show the served history and notification; run the integration tests and capture the real coverage report.

Review and understand the implementation, run the checks, resolve any merge conflicts, and document your own actual contributions according to course rules.
