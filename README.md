# QA Automation Testing Dashboard

A full-featured QA management web application for running testing sessions, reviewing submissions, managing tasks, and tracking issues. Built with React 19, Vite, and optional Supabase + Google Drive backends.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [User Roles & Permissions](#3-user-roles--permissions)
4. [Portals & Features](#4-portals--features)
   - 4.1 [Automation Testing (Admin Mode)](#41-automation-testing-admin-mode)
   - 4.2 [Tester Portal](#42-tester-portal)
   - 4.3 [Review Submissions](#43-review-submissions)
   - 4.4 [All Reports](#44-all-reports)
   - 4.5 [Planner Board](#45-planner-board)
   - 4.6 [Tickets](#46-tickets)
   - 4.7 [Manage Products](#47-manage-products)
   - 4.8 [Manage Accounts](#48-manage-accounts)
   - 4.9 [Testing Profiles](#49-testing-profiles)
5. [Notifications](#5-notifications)
6. [Activity Log](#6-activity-log)
7. [Quick Start — Local Mode](#7-quick-start--local-mode)
8. [Production Setup — Supabase](#8-production-setup--supabase)
9. [Google Drive Integration](#9-google-drive-integration)
10. [Deployment](#10-deployment)
11. [Database Schema Reference](#11-database-schema-reference)
12. [Environment Variables Reference](#12-environment-variables-reference)
13. [File Map](#13-file-map)

---

## 1. Overview

The QA Automation Testing Dashboard is used by QA teams to:

- Run structured testing sessions with per-question scoring, notes, and screenshots
- Allow testers to submit screenshot evidence without scoring
- Let reviewers assess tester screenshots and assign marks
- Plan and track QA work on a Kanban board
- Raise and resolve change requests / bug tickets
- Manage team accounts, product access, and testing question sets

The app runs entirely in the browser. All data is stored either in **localStorage** (zero-setup, for demos and local use) or in a **Supabase** cloud database (for team use). Photos and the activity log can optionally be offloaded to **Google Drive** via a lightweight Apps Script.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                 QA Automation Testing Dashboard              │
│  React 19 + Vite SPA                                        │
│                                                             │
│  src/App.jsx        — all UI components & state             │
│  src/db.js          — data access layer (abstracts storage) │
│  src/auth.js        — localStorage CRUD + session helpers   │
│  src/drive.js       — Google Drive / Apps Script client     │
│  src/config.js      — reads env vars, exports feature flags │
│  src/supabase.js    — Supabase client initialisation        │
└───────────────┬─────────────────────────────────────────────┘
                │
        ┌───────┴───────┐
        │               │
  USE_LOCAL=true   USE_LOCAL=false
        │               │
  localStorage     Supabase DB
  (auth.js)        (supabase.js)
                         │
                         └─── optional: Google Drive
                              (drive.js via Apps Script)
                              - Photos / screenshots
                              - Activity log JSON file
```

### Storage Decision Tree

| What | local mode | supabase mode |
|------|-----------|---------------|
| User accounts & passwords | `localStorage` → `qa_users` key | `qa_users` table |
| Sessions | `localStorage` → `qa_session` key | `localStorage` (client-only) |
| Testing submissions | `localStorage` → `qa_submissions` key | `qa_submissions` table |
| Testing profiles | `localStorage` → `qa_profiles` key | `qa_profiles` table |
| Products | `localStorage` → `qa_products` key | `qa_products` table |
| User → product access | `localStorage` → `qa_user_products` key | `qa_user_products` table |
| Planner tasks | `localStorage` → `qa_tasks` key | `qa_tasks` table |
| Tickets | `localStorage` → `qa_tickets` key | `qa_tickets` table |
| Notifications | `localStorage` → `qa_notifications` key | `qa_notifications` table |
| Photos / screenshots | base64 in submission record | base64 in DB **or** Google Drive file |
| Activity log | `localStorage` → `qa_activity_log` key | Google Drive JSON file |

---

## 3. User Roles & Permissions

There are three roles. Role is assigned by an Admin and stored per user account.

| Capability | Tester | Reviewer | Admin |
|-----------|:------:|:--------:|:-----:|
| Start Tester Portal session | ✅ | ✅ | ✅ |
| Start Automation Testing session | ❌ | ✅ | ✅ |
| View own reviewed reports | ✅ | ✅ | ✅ |
| Review tester submissions | ❌ | ✅ | ✅ |
| View all reports | ✅ | ✅ | ✅ |
| Manage Products | ❌ | ❌ | ✅ |
| Manage Accounts | ❌ | ❌ | ✅ |
| Manage Testing Profiles | ❌ | ✅ | ✅ |
| Create Planner tasks | ❌ | ✅ | ✅ |
| Edit / delete any Planner task | ❌ | ✅¹ | ✅ |
| Update task status (own tasks) | ✅ | ✅ | ✅ |
| Create Tickets | ✅ | ✅ | ✅ |
| Assign Tickets | ❌ | ✅ | ✅ |
| Delete Tickets | ❌ | ✅ | ✅ |
| See Level I items | ❌ | ❌ | ✅ |
| See Level II items | ❌ | ✅ | ✅ |
| See Level III items | ✅ | ✅ | ✅ |

> ¹ Reviewers can delete any task (including those created by other reviewers).

### Role Badge Colours

| Role | Colour |
|------|--------|
| Admin | Red pill |
| Reviewer | Blue pill |
| Tester | Green pill |

The logged-in user's name and role are shown as a styled badge below the notification bell on every page.

---

## 4. Portals & Features

All portals are accessed from the **Portal Hub** (IdleScreen) shown after login.

### 4.1 Automation Testing (Admin Mode)

**Who can access:** Admin, Reviewer

A full-featured QA evaluation session. The evaluator works through a question set, assigning scores, writing notes, and capturing/uploading screenshots for each question.

**Session details:**
- Maximum session duration: **12 hours**
- On session start, the evaluator selects a **Product** and optionally a **Testing Profile** (custom question set). Without a profile, the 30 default questions from `src/data/questions.js` are used.
- Each question has:
  - **Possible marks** (editable, default from the question definition)
  - **Earned score** — a numeric input capped at possible marks
  - **Notes** — free-text observation field
  - **Screenshot** — live capture (webcam) or file upload; watermarked with `Front | date & time` or `Back | date & time` for live captures
- A **Summary Bar** at the top shows total possible marks, earned marks, pass/fail counts, and photo upload count.
- On completion, the session is terminated and a PDF-style HTML report is generated and saved as a submission.

**Photo handling:**
- If Drive is configured (`VITE_DRIVE_SCRIPT_URL` set): photo is uploaded to Drive in the background; base64 kept locally for display
- Without Drive: base64 is stored directly in the submission record

---

### 4.2 Tester Portal

**Who can access:** All roles

A simplified testing session for testers. No scoring — testers upload one screenshot per question as evidence.

**Session details:**
- Maximum session duration: **60 minutes**
- Countdown timer shown in the header
- Questions are taken from the selected Testing Profile (or defaults)
- Each question: upload or capture one screenshot only
- On submission, the session is saved with type `"tester"` and becomes available for reviewers to assess

**Tester restrictions:**
- Cannot score or add numeric marks — that is done by the reviewer
- Can only view their own reports (reviewed ones only visible after review)
- Product and profile must be selected at session start

---

### 4.3 Review Submissions

**Who can access:** Admin, Reviewer

Shows all tester-submitted sessions for products the reviewer has access to (Admins see all).

**Review workflow:**
1. Select a tester submission from the list
2. For each question, view the uploaded screenshot and assign:
   - **Marks** (0 to possible marks for that question)
   - **Comment** (optional per-question feedback)
3. Submit the review — the submission is updated with review data
4. The reviewed report becomes visible to the tester in their All Reports view

---

### 4.4 All Reports

**Who can access:** All roles

Lists all completed submissions.

| Role | What they see |
|------|---------------|
| Admin | All submissions (automation + tester) |
| Reviewer | All submissions for their products |
| Tester | Only their own submissions that have a completed review |

Each row shows: username, product, profile, session type, duration, date, and review status.

Clicking a row opens the **Inline Report Viewer** which shows:
- Per-question scores, notes, and screenshots
- Summary stats (total earned / total possible, pass %, photos uploaded)
- Download PDF button

---

### 4.5 Planner Board

**Who can access:** All roles (with role-based editing restrictions)

A **Kanban board** for tracking QA work items across four columns:

| Column | ID | Description |
|--------|-----|-------------|
| Backlog | `backlog` | Not yet started |
| In Progress | `in-progress` | Actively being worked |
| In Review | `in-review` | Ready for review |
| Done | `done` | Complete |

#### Task Types

**Once** tasks (blue left border):
- Standard tasks with a due date
- Show: `Mon, Jul 28` style date chip

**Daily** tasks (green left border):
- Recurring templates set with a recur time (AM/PM format)
- Every day on portal load, one instance is auto-spawned from each template with today's date and status `in-progress`
- Daily instances older than **10 days** are automatically deleted on load
- Templates show 📌 tag; spawned instances show 🔁 tag

#### Task Fields

| Field | Required | Notes |
|-------|----------|-------|
| Type | ✅ | Once or Daily |
| Title | ✅ | |
| Description | — | Max 200 words |
| Ticket Level | ✅ | I, II, or III (see below) |
| Assignee | ✅ (admin/reviewer) | Filtered by level |
| Product | ✅ (admin/reviewer) | Filtered to assignee's accessible products |
| Due Date | ✅ for once | |
| Recur Time | ✅ for daily | Set once; reused every day |
| Tags | — | @mention teammates for notifications |
| Images | — | Upload or capture; stored in Drive or base64 |

#### Ticket Levels

Level restricts both **who can see** the task and **who can be assigned** to it:

| Level | Visible to | Assignable to |
|-------|-----------|---------------|
| Level I | Admin only | Admins only |
| Level II | Admin + Reviewer | Admins + Reviewers |
| Level III | Everyone | Anyone |

Level badge is always shown on every card (colour-coded: red / blue / green).

#### Role Restrictions on the Board

| Action | Tester | Reviewer | Admin |
|--------|:------:|:--------:|:-----:|
| Create task | ❌ | ✅ | ✅ |
| Edit any task | ✅² | ✅ | ✅ |
| Delete task | ❌ | ✅ | ✅ |
| Change assignee | In-review only³ | ✅ | ✅ |
| Move to Backlog | ❌ | ✅ | ✅ |
| Move to Done | ❌ | ✅ | ✅ |
| Drag-and-drop columns | ❌ | ✅ | ✅ |

> ² Testers can open and edit all visible tasks (description, status, assignee back to reviewer/admin when in-review)  
> ³ When a task is `in-review`, the tester can reassign to reviewer, admin, or themselves — and the task stays visible after reassignment

**Terminal state:** Once a task reaches `done`, a tester cannot move it to any other column.

**Column sort order:** Daily tasks first (sorted by recur time), then once tasks (sorted by due date).

---

### 4.6 Tickets

**Who can access:** All roles

A linear list for change requests, bug reports, and general issues.

#### Ticket Fields

| Field | Notes |
|-------|-------|
| Title | Required |
| Description | Max 200 words |
| Priority | Low / Medium / High |
| Ticket Level | I / II / III (same visibility rules as Planner) |
| Product | Optional product tag |
| Assignee | Restricted by level |
| Images | Upload only |

#### Status Flow

```
Open → In Progress → Resolved → Closed
```

#### Priorities

| Priority | Badge colour |
|---------|-------------|
| High | Red |
| Medium | Yellow/orange |
| Low | Grey |

#### Role Restrictions on Tickets

| Action | Tester | Reviewer | Admin |
|--------|:------:|:--------:|:-----:|
| Create ticket | ✅ (own only) | ✅ | ✅ |
| Edit own ticket (desc/images) | ✅ | ✅ | ✅ |
| Assign ticket | ❌ | ✅ | ✅ |
| Change status | Own open/in-progress | Any except closed | Any |
| Delete ticket | ❌ | ✅ | ✅ |

**Tester visibility:** Testers only see tickets they reported and only for products they have access to.

**Sort order:** Daily-tagged tickets first, then once, each group sorted by due date.

---

### 4.7 Manage Products

**Who can access:** Admin only

Create and manage products (e.g., PE, PT, PL or any custom name).

- Each product has a **name** and optional **description**
- Deleting a product also removes all user → product access links
- Default products (`PE`, `PT`, `PL`) are seeded on first run

**User access** is assigned per-user in **Manage Accounts** (not here). Testers can only see content (tasks, tickets, submissions) for their assigned products. Reviewers see all products. Admins see all products.

---

### 4.8 Manage Accounts

**Who can access:** Admin only

Full user management:

| Action | Details |
|--------|---------|
| View all users | Shows username, role, name, phone |
| Create account | Username (min 3 chars), password (min 6 chars), role, name, phone |
| Assign role | Admin / Reviewer / Tester |
| Assign product access | Checkboxes for all products |
| Reset password | New password, min 6 chars |
| Delete account | Permanent removal |

Default admin account: `admin` / `admin123` (auto-seeded on first run).

---

### 4.9 Testing Profiles

**Who can access:** Admin, Reviewer

Create named question sets used when starting testing sessions.

Each profile contains one or more questions, each with:
- **Standard code** (e.g., `FUNC-001`, `UI-002`)
- **Observation text** — what the evaluator checks
- **Possible marks** — the maximum score for this question

When starting a session, the user selects a product first, then a profile. If no profile is selected, the 30 default questions from `src/data/questions.js` are used.

Profiles can be created, edited (add/remove/reorder questions, edit marks), and deleted. Changes are saved automatically on the profile editor page.

---

## 5. Notifications

An in-app notification system sends real-time alerts for key events. The bell icon (🔔) appears in every page header with a red unread-count badge.

| Event | Who is notified |
|-------|----------------|
| Task assigned | The assignee |
| Tagged in a task | Each tagged user |
| Tester submits a report | All admins and reviewers |
| Ticket assigned | The assignee |

Clicking a notification marks it as read. "Mark all read" clears the badge count. Notifications are stored per-user in `qa_notifications`.

The bell polls every 30 seconds for new notifications.

---

## 6. Activity Log

All create, edit, delete, and status-change actions on the **Planner Board** and **Tickets** are recorded in an activity log.

**Storage:**
- If Google Drive is configured (`VITE_DRIVE_SCRIPT_URL` set): stored as `qa_activity_log.json` in the `QA Testing Photos` Drive folder
- Otherwise: stored in `localStorage` under key `qa_activity_log`

**Retention:** Entries older than **30 days** are automatically pruned when either portal is opened.

**Viewing the log:** Click the **📋 Log** button in the Planner Board or Tickets header. A slide-in panel shows all activity for that portal, newest first.

**Logged actions:**

| Action | Example detail |
|--------|----------------|
| created | `Created "Fix login bug"` |
| edited | `Edited "Fix login bug" — status: backlog → in-progress; assignee: — → alice` |
| deleted | `Deleted "Fix login bug"` |
| status_changed | `"Fix login bug" — in-progress → in-review` (drag-and-drop) |

Each log entry records: actor username, action, item title, change details, and timestamp.

---

## 7. Quick Start — Local Mode

No server or database required. Everything runs in the browser.

```bash
git clone <repo>
cd Automation_testing
npm install
npm run dev
```

Open `http://localhost:5173`. Log in with `admin` / `admin123`.

All data is stored in your browser's `localStorage`. Clearing browser data resets the app to defaults.

---

## 8. Production Setup — Supabase

### Step 1 — Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your **Project URL** and **anon public key** from Settings → API

### Step 2 — Run the schema

In Supabase dashboard → SQL Editor → New query, paste and run the full contents of `supabase_schema.sql`. This:
- Creates all tables
- Seeds the default admin user (`admin` / `admin123`)
- Seeds default products (PE, PT, PL)
- Disables Row Level Security (app handles auth itself)
- Grants API access to anon role

### Step 3 — Configure environment

Create a `.env` file in the project root:

```env
VITE_DB_BACKEND=supabase
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Step 4 — Build and run

```bash
npm run build
npm run preview    # local preview of production build
```

---

## 9. Google Drive Integration

Google Drive is used for two purposes when configured:

| Purpose | Stored as |
|---------|-----------|
| Photos / screenshots | Image files in `QA Testing Photos/` folder |
| Activity log | `qa_activity_log.json` in `QA Testing Photos/` folder |

Both are handled by a single **Google Apps Script web app**. If Drive is not configured, photos fall back to base64-in-database and the log falls back to localStorage — no errors, no broken images.

### One-Time Setup

#### 1. Create the Apps Script

1. Go to [script.google.com](https://script.google.com)
2. Click **New project**, delete the default code
3. Paste the entire contents of `google_apps_script.js` (in this repo root)
4. Save the project (name it e.g. `QA Storage`)

#### 2. Deploy as Web App

1. Click **Deploy → New deployment**
2. Click the gear icon next to "Type" → select **Web app**
3. Set **Execute as: Me** and **Who has access: Anyone**
4. Click **Deploy**, authorize Drive access when prompted
5. Copy the **Web app URL**:
   ```
   https://script.google.com/macros/s/AKfycb.../exec
   ```

#### 3. Add to `.env`

```env
VITE_DRIVE_SCRIPT_URL=https://script.google.com/macros/s/YOUR_ID/exec
```

### What Gets Created in Drive

```
My Drive/
└── QA Testing Photos/
    ├── photo_<timestamp>.jpg      ← screenshots
    ├── photo_<timestamp>.jpg
    └── qa_activity_log.json       ← activity log
```

### Redeploying After Script Changes

After updating `google_apps_script.js`, you must create a new version:
1. Apps Script editor → **Deploy → Manage deployments**
2. Edit → **New version** → Deploy

The URL remains the same.

### Supported Actions

The Apps Script handles these POST actions:

| Action | Body | Response |
|--------|------|----------|
| `upload` | `{ action, base64, filename, mimeType }` | `{ fileId, url }` |
| `delete` | `{ action, fileId }` | `{ success }` |
| `appendLog` | `{ action, entry }` | `{ success }` |
| `readLogs` | `{ action }` | `{ logs: [...] }` |
| `pruneOldLogs` | `{ action, cutoff }` | `{ success }` |

---

## 10. Deployment

### Docker

A production-ready Dockerfile is included. It builds the app with Nginx serving the static files.

```bash
docker build \
  --build-arg VITE_DB_BACKEND=supabase \
  --build-arg VITE_SUPABASE_URL=https://... \
  --build-arg VITE_SUPABASE_ANON_KEY=eyJ... \
  --build-arg VITE_DRIVE_SCRIPT_URL=https://... \
  -t qa-dashboard .

docker run -p 80:80 qa-dashboard
```

The app is served at `http://localhost`.

> **Note:** Vite env vars are baked into the JS bundle at build time. They must be passed as `--build-arg` to the Docker build stage, not at runtime.

### GitHub Pages / CI

Add secrets in **GitHub repo → Settings → Secrets and variables → Actions**, then reference them in your workflow:

```yaml
- name: Build
  run: npm run build
  env:
    VITE_DB_BACKEND: supabase
    VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
    VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
    VITE_DRIVE_SCRIPT_URL: ${{ secrets.VITE_DRIVE_SCRIPT_URL }}
```

### Static Server / CDN

```bash
npm run build   # outputs to dist/
```

Upload the `dist/` folder to any static host (Vercel, Netlify, S3, Nginx, etc.). All routes serve `index.html` — configure your host to rewrite all 404s to `index.html` for React Router compatibility (though this app uses state-based routing so a simple root serve is sufficient).

---

## 11. Database Schema Reference

Run `supabase_schema.sql` once to create all tables. The file is idempotent — safe to run again on an existing database.

### `qa_users`
| Column | Type | Notes |
|--------|------|-------|
| `username` | TEXT PK | Case-insensitive login |
| `password` | TEXT | Plaintext (no auth system; internal tool only) |
| `role` | TEXT | `admin` \| `reviewer` \| `tester` |
| `name` | TEXT | Display name |
| `phone` | TEXT | Optional |

### `qa_submissions`
| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | |
| `type` | TEXT | `admin` \| `tester` |
| `username` | TEXT | |
| `profile_name` | TEXT | Testing profile used |
| `product_id` | TEXT | |
| `product_name` | TEXT | |
| `start_time` | BIGINT | Unix ms |
| `end_time` | BIGINT | Unix ms |
| `rows` | JSONB | Array of question rows (scores, notes, screenshots) |
| `review` | JSONB | Reviewer marks and comments |

### `qa_profiles`
| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | |
| `name` | TEXT | Profile display name |
| `created_at` | BIGINT | Unix ms |
| `questions` | JSONB | Array of `{ id, standard, observation, possibleMarks }` |

### `qa_products`
| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | |
| `name` | TEXT | |
| `description` | TEXT | |
| `created_at` | BIGINT | Unix ms |

### `qa_user_products`
| Column | Type | Notes |
|--------|------|-------|
| `username` | TEXT | Composite PK |
| `product_id` | TEXT | Composite PK |

### `qa_tasks`
| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | Daily instances use `task_daily_<tpl_id>_<YYYY-MM-DD>` |
| `title` | TEXT | |
| `description` | TEXT | |
| `status` | TEXT | `backlog` \| `in-progress` \| `in-review` \| `done` |
| `product_id` | TEXT | |
| `product_name` | TEXT | |
| `assignee` | TEXT | Username |
| `created_by` | TEXT | Username |
| `tags` | JSONB | Array of usernames |
| `images` | JSONB | Array of `{ base64, url, name, driveFileId }` |
| `created_at` | BIGINT | Unix ms |
| `updated_at` | BIGINT | Unix ms |
| `due_date` | TEXT | `YYYY-MM-DD` |
| `label` | TEXT | `once` \| `daily` |
| `recur_time` | TEXT | `HH:MM` (24h); shown as AM/PM |
| `template_id` | TEXT | Set on daily instances; points to template task id |
| `level` | TEXT | `I` \| `II` \| `III` |

### `qa_tickets`
| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | |
| `title` | TEXT | |
| `description` | TEXT | |
| `status` | TEXT | `open` \| `in-progress` \| `resolved` \| `closed` |
| `priority` | TEXT | `low` \| `medium` \| `high` |
| `product_id` | TEXT | |
| `product_name` | TEXT | |
| `reporter` | TEXT | Username |
| `assignee` | TEXT | Username |
| `images` | JSONB | Array of `{ base64, url, name }` |
| `created_at` | BIGINT | Unix ms |
| `updated_at` | BIGINT | Unix ms |
| `due_date` | TEXT | `YYYY-MM-DD` |
| `label` | TEXT | `once` \| `daily` |
| `level` | TEXT | `I` \| `II` \| `III` |

### `qa_notifications`
| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | |
| `to_username` | TEXT | Recipient |
| `message` | TEXT | Display text |
| `type` | TEXT | `task_assigned` \| `task_tagged` \| `report_submitted` \| `ticket_assigned` |
| `ref_id` | TEXT | ID of related task / ticket / submission |
| `ref_type` | TEXT | `task` \| `ticket` \| `submission` |
| `read` | BOOLEAN | `false` = unread |
| `created_at` | BIGINT | Unix ms |

---

## 12. Environment Variables Reference

| Variable | Values | Default | Required |
|----------|--------|---------|----------|
| `VITE_DB_BACKEND` | `local` \| `supabase` | `local` | No |
| `VITE_SUPABASE_URL` | Supabase project URL | — | When DB = supabase |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key | — | When DB = supabase |
| `VITE_DRIVE_SCRIPT_URL` | Apps Script web app URL | — | For Drive photos + log |

> Legacy variable `VITE_USE_LOCAL=true` is still supported as an alias for `VITE_DB_BACKEND=local`.
> Legacy variable `VITE_DRIVE_SCRIPT_URL` being set is treated as `VITE_PHOTO_BACKEND=gdrive`.

### Common Configurations

**Local / demo (no server needed):**
```env
VITE_DB_BACKEND=local
```

**Team / production with Supabase only:**
```env
VITE_DB_BACKEND=supabase
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

**Full production with Supabase + Drive:**
```env
VITE_DB_BACKEND=supabase
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_DRIVE_SCRIPT_URL=https://script.google.com/macros/s/.../exec
```

---

## 13. File Map

```
Automation_testing/
├── src/
│   ├── App.jsx              — All UI components (4100+ lines)
│   │   ├── ProfileMenu      — User badge + logout, shown on every page
│   │   ├── NotificationBell — Bell icon with unread count, shown on every page
│   │   ├── BrandTitle       — Logo + app name header element
│   │   ├── LogPanel         — Activity log slide-in panel
│   │   ├── ReviewPortal     — Review tester submissions
│   │   ├── InlineReportViewer — Full report view
│   │   ├── ReportsPortal    — All reports list
│   │   ├── TestingProfilesPortal — Profile list
│   │   ├── ProfileEditorPortal  — Profile create/edit
│   │   ├── ProfilePickerPortal  — Product + profile selection at session start
│   │   ├── ProductsPortal   — Manage products
│   │   ├── AccountsPortal   — Manage user accounts
│   │   ├── KanbanPortal     — Planner board
│   │   ├── KanbanCard       — Single task card
│   │   ├── TaskModal        — Create / edit task modal
│   │   ├── TicketsPortal    — Tickets list
│   │   ├── TicketModal      — Create / edit ticket modal
│   │   ├── IdleScreen       — Portal hub (after login)
│   │   ├── TerminatedScreen — Session ended, submit report
│   │   └── App (default)    — Root: session management, view routing
│   ├── App.css              — All styles
│   ├── auth.js              — localStorage CRUD for all entities
│   ├── db.js                — Data access layer (USE_LOCAL branch + Drive log)
│   ├── drive.js             — Google Drive / Apps Script client
│   ├── config.js            — Reads env vars, exports USE_LOCAL / USE_GDRIVE
│   ├── supabase.js          — Supabase client
│   ├── LoginPage.jsx        — Login / signup page
│   ├── LoginPage.css        — Login styles
│   ├── data/
│   │   └── questions.js     — 30 default QA questions with marks
│   └── assets/
│       └── logo.png         — App logo
├── google_apps_script.js    — Paste into Google Apps Script editor
├── supabase_schema.sql      — Run once in Supabase SQL Editor
├── Dockerfile               — Multi-stage build (Node build + Nginx serve)
├── nginx.conf               — Nginx config for SPA routing
├── CONFIGURATION.md         — Detailed storage configuration guide
├── GOOGLE_DRIVE_SETUP.md    — Drive photo storage setup guide
├── vite.config.js
└── package.json
```

---

## Default Credentials

| Username | Password | Role |
|----------|----------|------|
| `admin` | `admin123` | Admin |

Change the admin password immediately after your first login in production (Manage Accounts → Reset Password).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 8 |
| Styling | Plain CSS (no framework) |
| Database (optional) | Supabase (PostgreSQL) |
| File storage (optional) | Google Drive via Apps Script |
| Containerisation | Docker + Nginx |
| Linting | Oxlint |
