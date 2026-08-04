// ── Central app configuration ─────────────────────────────────────────────────
// All behaviour is driven by environment variables in .env
// See CONFIGURATION.md for full documentation
// ─────────────────────────────────────────────────────────────────────────────

const env = import.meta.env;

// VITE_DB_BACKEND: 'google_sheets' | 'local'   (default: 'local')
// VITE_PHOTO_BACKEND: 'database' | 'gdrive'  (default: 'database')
//
// Legacy support: VITE_USE_LOCAL=true maps to db=local
//                 VITE_DRIVE_SCRIPT_URL set maps to photos=gdrive

const dbBackend =
  env.VITE_DB_BACKEND ||
  (env.VITE_USE_LOCAL === "true" ? "local" : "local"); // Changed default fallback from 'supabase' to 'local'

const photoBackend =
  env.VITE_PHOTO_BACKEND ||
  (env.VITE_DRIVE_SCRIPT_URL ? "gdrive" : "database");

export const config = {
  storage: {
    // Where user accounts, submissions, profiles, products are stored
    // 'local'         → browser localStorage  (no server, admin/admin123 works out of the box)
    // 'google_sheets' → Google Sheets via Apps Script
    database: dbBackend,

    // Where photo / screenshot files are stored
    // 'database' → base64 embedded inside the submission record
    // 'gdrive'   → uploaded to Google Drive, only URL stored in submission
    photos: photoBackend,
  },

  googleSheets: { // New block for Google Sheets configuration
    webAppUrl: env.VITE_GOOGLE_SHEETS_WEB_APP_URL ?? "",
  },

  gdrive: {
    scriptUrl: env.VITE_DRIVE_SCRIPT_URL ?? "",
  },
};

// Convenience flags used across db.js, drive.js, App.jsx
export const USE_LOCAL         = config.storage.database === "local";
export const USE_GDRIVE        = config.storage.photos   === "gdrive" && !!config.gdrive.scriptUrl;
export const USE_GOOGLE_SHEETS = config.storage.database === "google_sheets"; // New flag
