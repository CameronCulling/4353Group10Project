QueueSmart backend - SQLite integration update
================================================

This folder contains the backend source from the uploaded project with the
SQLite integration fixes applied.

Installation:
1. Stop the running Node server.
2. Back up your existing backend folder.
3. Replace the matching source files with the files in this archive.
   You can replace the entire backend folder, but do NOT copy node_modules
   or queuesmart.sqlite from your old folder over the supplied source.
4. From the backend directory, run:
       npm install
       node --test tests/*.test.js
       npm start

Verified environment:
- Node.js v22.16.0
- All 72 tests passed with:
      node --test tests/*.test.js

Important implementation notes:
- createApp({ db, userRepository }) now uses the same injected SQLite
  connection for all repositories and routes.
- Fresh databases seed DMV Services, Student Advising, and Financial Aid,
  with an initially open queue for each.
- Existing databases are migrated to add Notification.type if needed.
- The legacy in-memory queue/activity helper functions remain exported
  for compatibility with the original unit tests. Live API routes use
  SQLite repositories.
- History and notification recording use SQLite.
- /api/notifications/read-all is registered before /api/notifications/:id.
- Sessions are still stored in memory and are reset when the server restarts.
