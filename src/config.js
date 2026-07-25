// ── Central app configuration ─────────────────────────────────────────────────
// All behaviour is driven by environment variables in .env
// See CONFIGURATION.md for full documentation
// ─────────────────────────────────────────────────────────────────────────────

const env = import.meta.env;

// VITE_DB_BACKEND: 'supabase' | 'local'   (default: 'local')
// VITE_PHOTO_BACKEND: 'database' | 'gdrive'  (default: 'database')
//
// Legacy support: VITE_USE_LOCAL=true maps to db=local
//                 VITE_DRIVE_SCRIPT_URL set maps to photos=gdrive

const dbBackend =
  env.VITE_DB_BACKEND ||
  (env.VITE_USE_LOCAL === "true" ? "local" : "supabase");

const photoBackend =
  env.VITE_PHOTO_BACKEND ||
  (env.VITE_DRIVE_SCRIPT_URL ? "gdrive" : "database");

export const config = {
  storage: {
    // Where user accounts, submissions, profiles, products are stored
    // 'local'    → browser localStorage  (no server, admin/admin123 works out of the box)
    // 'supabase' → Supabase cloud database
    database: dbBackend,

    // Where photo / screenshot files are stored
    // 'database' → base64 embedded inside the submission record
    // 'gdrive'   → uploaded to Google Drive, only URL stored in submission
    photos: photoBackend,
  },

  supabase: {
    url:     env.VITE_SUPABASE_URL    ?? "",
    anonKey: env.VITE_SUPABASE_ANON_KEY ?? "",
  },

  gdrive: {
    scriptUrl: env.VITE_DRIVE_SCRIPT_URL ?? "",
  },
};

// Convenience flags used across db.js, drive.js, App.jsx
export const USE_LOCAL    = config.storage.database === "local";
export const USE_GDRIVE   = config.storage.photos   === "gdrive" && !!config.gdrive.scriptUrl;
