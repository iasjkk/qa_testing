# Google Drive Integration — Setup Guide

When `VITE_DRIVE_SCRIPT_URL` is set, Google Drive is used for two things:

| Purpose | What is stored |
|---------|---------------|
| **Photos / screenshots** | Image files uploaded by testers and evaluators |
| **Activity log** | `qa_activity_log.json` — all Planner Board and Ticket actions |

If the variable is not set, the app falls back to storing photos as base64 in the database and the activity log in `localStorage`. No errors occur in fallback mode.

---

## How It Works

```
Browser                         Google Apps Script Web App
  │                                         │
  │── POST { action: "upload", base64 } ──► │── saves file to Drive
  │◄── { fileId, url } ─────────────────── │
  │                                         │
  │── POST { action: "appendLog", entry } ► │── appends to qa_activity_log.json
  │                                         │
  │── POST { action: "readLogs" } ─────── ► │── returns all log entries
  │◄── { logs: [...] } ──────────────────── │
  │                                         │
  │── POST { action: "pruneOldLogs" } ──── ►│── deletes entries older than cutoff
```

All communication is JSON over HTTPS POST. The Apps Script web app runs under your Google account and has access only to your Drive.

---

## One-Time Setup

### Step 1 — Create the Apps Script

1. Go to [script.google.com](https://script.google.com)
2. Click **New project**
3. Delete all default code in the editor
4. Copy and paste the entire contents of `google_apps_script.js` (in this repo root)
5. Save the project (name it anything, e.g. `QA Storage`)

### Step 2 — Deploy as Web App

1. In the Apps Script editor, click **Deploy → New deployment**
2. Click the gear icon (⚙️) next to "Select type" → choose **Web app**
3. Configure:
   - **Description:** `QA Storage v1` (or any label)
   - **Execute as:** `Me`
   - **Who has access:** `Anyone`
4. Click **Deploy**
5. When prompted, click **Authorize access** and grant Drive permissions
6. Copy the **Web app URL** — it looks like:
   ```
   https://script.google.com/macros/s/AKfycbxxxxxxxxxxxxxxxxxxxxxxxxxx/exec
   ```

### Step 3 — Add to Environment

```env
VITE_DRIVE_SCRIPT_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
```

For Docker:
```bash
docker build --build-arg VITE_DRIVE_SCRIPT_URL=https://... -t qa-dashboard .
```

For GitHub Actions — add as a repository secret (`VITE_DRIVE_SCRIPT_URL`) and reference it in your workflow:
```yaml
VITE_DRIVE_SCRIPT_URL: ${{ secrets.VITE_DRIVE_SCRIPT_URL }}
```

---

## What Gets Created in Drive

```
My Drive/
└── QA Testing Photos/          ← folder created automatically on first use
    ├── photo_1721234567890.jpg  ← screenshots (one per upload)
    ├── photo_1721234567891.jpg
    └── qa_activity_log.json    ← activity log (created on first log entry)
```

- Screenshots are named `photo_<timestamp>.jpg` and shared as **anyone with link can view**
- `qa_activity_log.json` is kept **private** (your account only)

---

## Supported Actions

The Apps Script handles these POST requests:

| Action | Request body | Response |
|--------|-------------|----------|
| `upload` | `{ action, base64, filename, mimeType }` | `{ fileId, url }` |
| `delete` | `{ action, fileId }` | `{ success: true }` |
| `appendLog` | `{ action, entry }` | `{ success: true }` |
| `readLogs` | `{ action }` | `{ logs: [...] }` |
| `pruneOldLogs` | `{ action, cutoff }` (cutoff = Unix ms) | `{ success: true }` |

---

## Activity Log Format

Each log entry in `qa_activity_log.json` is a JSON object:

```json
{
  "id": "log_1721234567890_abc12",
  "refType": "task",
  "refId": "task_1721234567890",
  "refTitle": "Fix login bug",
  "actor": "alice",
  "action": "status_changed",
  "detail": "in-progress → in-review",
  "createdAt": 1721234567890
}
```

| Field | Values |
|-------|--------|
| `refType` | `task` or `ticket` |
| `action` | `created` \| `edited` \| `deleted` \| `status_changed` |
| `detail` | Human-readable change summary (empty string for `created`/`deleted`) |

---

## Lifecycle

### Photos

- **Captured / uploaded** → uploaded to Drive immediately in background; base64 kept in React state for display
- **Report deleted** → Drive files are trashed via `delete` action
- **No Drive configured** → photos stored as base64 inside the submission record

### Activity Log

- **Action performed** → `appendLog` called (fire-and-forget, never blocks the UI)
- **Portal opened** → `pruneOldLogs` called with a cutoff of 30 days ago; old entries removed from Drive
- **Log panel opened** → `readLogs` called and entries displayed newest-first

---

## Redeploying After Script Changes

When you update `google_apps_script.js` (e.g. after pulling a new version of this repo):

1. Open [script.google.com](https://script.google.com) and open your project
2. Replace the editor contents with the updated file
3. Click **Deploy → Manage deployments**
4. Click the pencil (✏️) icon next to your deployment
5. Under "Version", select **New version**
6. Click **Deploy**

The web app URL **stays the same** — no changes needed to `.env` or secrets.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Photos stuck at "Uploading…" | Wrong script URL in `.env` | Double-check `VITE_DRIVE_SCRIPT_URL` |
| CORS error in browser console | Script not deployed as Web App "Anyone" | Re-deploy with access = Anyone (not "Anyone with Google account") |
| Log panel shows "No activity yet" even after actions | Drive not configured → log went to localStorage, but panel reads Drive | Check `VITE_DRIVE_SCRIPT_URL` is set; or open devtools → Application → localStorage → `qa_activity_log` to see local log |
| `{"error": "..."}` response | Script exception | Open Apps Script editor → Executions tab to see the error |
| Old submissions still show base64 | Expected — base64 is only replaced for new uploads | Old submissions are unaffected |
| Script runs but Drive folder not found | Permission issue on first run | Open the Apps Script URL directly in a browser to trigger folder creation |
