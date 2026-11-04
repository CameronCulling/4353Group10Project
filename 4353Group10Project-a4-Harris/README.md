Each folder contains the parts that our group worked on.
To run :
1. Ensure the latest version of Node.js is installed
2. Download and extract the ZIP
3. Navigate to the backend folder using command prompt/terminal e.g: cd downloads/4353groupproject/4353groupproject/backend 
4. Type: npm install express
5. Type: npm start
6. Navigate to website by opening a browser and typing: http://localhost:3000/
7. Create a user account, accounts persist in SQLite across server restarts
8. Login on another tab using an administrator account provisioned below; here you can create and manage services, services must be opened in the admin before the user can join them
9. Stop server using: ctrl + c
10. To run code tests and coverage report, navigate to backend using command prompt again and type: npm test and then npm run coverage


Administrator setup (run locally from `4353Group10Project-a3/backend`):

Set `QUEUESMART_ADMIN_EMAIL` and a unique `QUEUESMART_ADMIN_PASSWORD` of at least 12 characters in your terminal environment. Optionally set `QUEUESMART_ADMIN_NAME`. Run `node scripts/createAdmin.js`, then clear the password variable (`set QUEUESMART_ADMIN_PASSWORD=` in Command Prompt or `Remove-Item Env:QUEUESMART_ADMIN_PASSWORD` in PowerShell). Never commit credentials or include them in screenshots. The script refuses existing accounts and does not promote regular users.

Credentials and profiles are stored in `backend/queuesmart.sqlite`, or the path specified by `QUEUESMART_DB_PATH`. Sessions and other service/queue activity remain in memory. Tests use isolated databases and a test-only administrator; they do not use the real application database. Clear any temporary `QUEUESMART_DB_PATH` override before starting the app.

The schema permits service priority `medium` for newly initialized databases. Existing tables are not migrated by `CREATE TABLE IF NOT EXISTS`; coordinate a migration with Cameron instead of deleting an existing database.
