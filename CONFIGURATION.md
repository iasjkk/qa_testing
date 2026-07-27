# Configuration Guide

All behaviour is driven by environment variables in `.env`.  
Copy `.env.example` to `.env` and set the values for your deployment.

---

## Storage Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    QA Testing App                       │
│                                                         │
│  ┌──────────────┐          ┌───────────────────────┐   │
│  │  VITE_DB_    │          │  VITE_PHOTO_BACKEND   │   │
│  │  BACKEND     │          │                       │   │
│  │              │          │  'database'           │   │
│  │  'local'     │          │  → base64 in DB       │   │
│  │  → localStorage         │                       │   │
│  │              │          │  'gdrive'             │   │
│  │  'supabase'  │          │  → Google Drive files │   │
│  │  → Supabase  │          └───────────────────────┘   │
│  └──────────────┘                                       │
└─────────────────────────────────────────────────────────┘
```

---

## Environment Variables

| Variable | Values | Default | Required |
|----------|--------|---------|----------|
| `VITE_DB_BACKEND` | `local` \| `supabase` | `local` | No |
| `VITE_PHOTO_BACKEND` | `database` \| `gdrive` | `database` | No |
| `VITE_SUPABASE_URL` | Supabase project URL | — | When DB = supabase |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key | — | When DB = supabase |
| `VITE_DRIVE_SCRIPT_URL` | Apps Script web app URL | — | When photos = gdrive |

---

## What Is Stored Where

### When `VITE_DB_BACKEND=local`

| Data | Location |
|------|----------|
| User accounts & passwords | `localStorage` (key: `qa_users`) |
| Sessions | `localStorage` (key: `qa_session`) |
| Submissions & scores | `localStorage` (key: `qa_submissions`) |
| Testing profiles | `localStorage` (key: `qa_profiles`) |
| Products | `localStorage` (key: `qa_products`) |
| User → product access | `localStorage` (key: `qa_user_products`) |
| Planner tasks | `localStorage` (key: `qa_tasks`) |
| Tickets | `localStorage` (key: `qa_tickets`) |
| Notifications | `localStorage` (key: `qa_notifications`) |
| Activity log | `localStorage` (key: `qa_activity_log`) when Drive not configured |

> Default admin: `admin` / `admin123` — seeded automatically on first run.

---

### When `VITE_DB_BACKEND=supabase`

| Data | Supabase Table |
|------|---------------|
| User accounts & passwords | `qa_users` |
| Submissions & scores | `qa_submissions` |
| Testing profiles | `qa_profiles` |
| Products | `qa_products` |
| User → product access | `qa_user_products` |
| Planner tasks | `qa_tasks` |
| Tickets | `qa_tickets` |
| Notifications | `qa_notifications` |
| Activity log | Google Drive JSON file (when `VITE_DRIVE_SCRIPT_URL` set) |

> Run `supabase_schema.sql` once in Supabase SQL Editor to create all tables.  
> See `GOOGLE_DRIVE_SETUP.md` for the full Supabase setup steps.

---

### Photos — `VITE_PHOTO_BACKEND=database` (default)

Photos are encoded as **base64 strings** and stored inside the submission record.

- ✅ No extra setup
- ✅ Works offline / locally
- ❌ Large database size (1 photo ≈ 1–3 MB in DB)
- ❌ Hits localStorage limits (~5 MB total) with many photos

---

### Photos — `VITE_PHOTO_BACKEND=gdrive`

Photos are uploaded to **Google Drive** via an Apps Script web app.  
Only the Drive URL is stored in the submission — no base64 in the DB.

- ✅ Database stays small
- ✅ Photos organized in a single Drive folder
- ✅ Easy to browse, download, or share photos from Drive
- ❌ Requires one-time Apps Script setup (see `GOOGLE_DRIVE_SETUP.md`)
- ❌ Requires internet on photo capture

---

## Common Configurations

### Local development / demo (no server)
```env
VITE_DB_BACKEND=local
VITE_PHOTO_BACKEND=database
```
Login with `admin` / `admin123`. Everything in browser localStorage.

---

### Production with Supabase, photos in Drive
```env
VITE_DB_BACKEND=supabase
VITE_PHOTO_BACKEND=gdrive
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_DRIVE_SCRIPT_URL=https://script.google.com/macros/s/.../exec
```

---

### Production with Supabase, photos in DB
```env
VITE_DB_BACKEND=supabase
VITE_PHOTO_BACKEND=database
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

---

## GitHub Pages / CI Deployment

Set secrets in **GitHub repo → Settings → Secrets and variables → Actions**, then reference them in `.github/workflows/deploy.yml`:

```yaml
- run: npm run build
  env:
    VITE_DB_BACKEND: supabase
    VITE_PHOTO_BACKEND: gdrive
    VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
    VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
    VITE_DRIVE_SCRIPT_URL: ${{ secrets.VITE_DRIVE_SCRIPT_URL }}
```

---

## Config Source File

`src/config.js` is the single place that reads all env vars and exports:

```js
config.storage.database   // 'local' | 'supabase'
config.storage.photos     // 'database' | 'gdrive'
config.supabase.url
config.supabase.anonKey
config.gdrive.scriptUrl

USE_LOCAL    // true when database = 'local'
USE_GDRIVE   // true when photos = 'gdrive' AND scriptUrl is set
```

`db.js` imports `USE_LOCAL` → routes all calls to localStorage or Supabase.  
`drive.js` imports `USE_GDRIVE` → enables/disables Drive upload path.
