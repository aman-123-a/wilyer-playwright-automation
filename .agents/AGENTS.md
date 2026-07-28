# Workspace Rules

## ClickUp Task Creation Workflow

When the user says **"add to clickup"**, **"upload to clickup"**, or any variation of adding tasks to ClickUp, follow this exact workflow:

1. **Always ASK which list/path** to add the task to. Show the available lists from `clickup-config.json` and let the user pick. Never assume a default list.
2. **Always ASK which status** to set (e.g., backlog, in progress, etc.). Never set a status without the user explicitly saying which status to use.
3. **Always ASK the priority** (Urgent, High, Normal, Low). Never assume a default priority.
4. **Never create a task without confirming** the list, status, and priority with the user first.
5. Use the ClickUp API config stored in `clickup-config.json` at the project root.
6. The ClickUp space is **CMS** and the folder is **2026 Support Team** by default, but always confirm if the user wants a different path.

### Available Lists (2026 Support Team folder):

- Android Improvements
- CMS - Bugs April
- Bugs (June 2026)
- On Primse bug
- LG & Samsung bug
- CMS Improvements

### Task Creation API:

- Endpoint: `POST https://api.clickup.com/api/v2/list/{list_id}/task`
- Auth header: `Authorization: {apiToken from clickup-config.json}`
- Body: `{ name, description, status: [user-specified], priority }`
