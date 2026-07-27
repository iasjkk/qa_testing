-- ═══════════════════════════════════════════════════════════════════
-- Run this ENTIRE script once in Supabase → SQL Editor → New query
-- Safe to re-run on an existing database (all statements are idempotent)
-- ═══════════════════════════════════════════════════════════════════

-- ── Users ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.qa_users (
  username  TEXT PRIMARY KEY,
  password  TEXT NOT NULL,
  role      TEXT NOT NULL DEFAULT 'tester',
  name      TEXT DEFAULT '',
  phone     TEXT DEFAULT ''
);

INSERT INTO public.qa_users (username, password, role, name)
VALUES ('admin', 'admin123', 'admin', 'Administrator')
ON CONFLICT (username) DO UPDATE SET password = 'admin123', role = 'admin';

-- ── Submissions ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.qa_submissions (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  username     TEXT NOT NULL,
  profile_name TEXT,
  start_time   BIGINT,
  end_time     BIGINT,
  rows         JSONB DEFAULT '[]',
  review       JSONB,
  product_id   TEXT,
  product_name TEXT
);

-- ── Testing profiles ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.qa_profiles (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at BIGINT,
  questions  JSONB DEFAULT '[]'
);

-- ── Products ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.qa_products (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at  BIGINT DEFAULT 0
);

INSERT INTO public.qa_products (id, name, description, created_at) VALUES
  ('pe', 'PE', 'Product PE', 0),
  ('pt', 'PT', 'Product PT', 0),
  ('pl', 'PL', 'Product PL', 0)
ON CONFLICT (id) DO NOTHING;

-- ── User → Product access ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.qa_user_products (
  username    TEXT NOT NULL,
  product_id  TEXT NOT NULL,
  PRIMARY KEY (username, product_id)
);

-- ── Planner tasks ─────────────────────────────────────────────────
-- label      : 'once' | 'daily'   (daily = recurring template)
-- recur_time : HH:MM (24h) for daily tasks
-- template_id: set on daily instances; references the template task id
-- level      : 'I' (admin) | 'II' (reviewer+admin) | 'III' (everyone)
CREATE TABLE IF NOT EXISTS public.qa_tasks (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  description  TEXT DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'backlog',
  product_id   TEXT,
  product_name TEXT,
  assignee     TEXT,
  created_by   TEXT NOT NULL,
  tags         JSONB DEFAULT '[]',
  images       JSONB DEFAULT '[]',
  created_at   BIGINT,
  updated_at   BIGINT,
  due_date     TEXT,
  label        TEXT DEFAULT 'once',
  recur_time   TEXT,
  template_id  TEXT,
  level        TEXT DEFAULT 'III'
);

-- ── Tickets ───────────────────────────────────────────────────────
-- label      : 'once' | 'daily'
-- recur_time : HH:MM (24h) for daily tickets
-- template_id: set on daily instances; references the template ticket id
-- level      : 'I' (admin) | 'II' (reviewer+admin) | 'III' (everyone)
CREATE TABLE IF NOT EXISTS public.qa_tickets (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  description  TEXT DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'open',
  priority     TEXT NOT NULL DEFAULT 'medium',
  product_id   TEXT,
  product_name TEXT,
  reporter     TEXT NOT NULL,
  assignee     TEXT,
  images       JSONB DEFAULT '[]',
  created_at   BIGINT,
  updated_at   BIGINT,
  due_date     TEXT,
  label        TEXT DEFAULT 'once',
  recur_time   TEXT,
  template_id  TEXT,
  level        TEXT DEFAULT 'III'
);

-- ── Notifications ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.qa_notifications (
  id          TEXT PRIMARY KEY,
  to_username TEXT NOT NULL,
  message     TEXT NOT NULL,
  type        TEXT,
  ref_id      TEXT,
  ref_type    TEXT,
  read        BOOLEAN DEFAULT FALSE,
  created_at  BIGINT
);

-- ── Upgrade columns (safe to run on tables that already exist) ────
-- These add any columns that were introduced after initial deployment.
ALTER TABLE public.qa_tasks    ADD COLUMN IF NOT EXISTS due_date     TEXT;
ALTER TABLE public.qa_tasks    ADD COLUMN IF NOT EXISTS label        TEXT DEFAULT 'once';
ALTER TABLE public.qa_tasks    ADD COLUMN IF NOT EXISTS recur_time   TEXT;
ALTER TABLE public.qa_tasks    ADD COLUMN IF NOT EXISTS template_id  TEXT;
ALTER TABLE public.qa_tasks    ADD COLUMN IF NOT EXISTS level        TEXT DEFAULT 'III';

ALTER TABLE public.qa_tickets  ADD COLUMN IF NOT EXISTS due_date     TEXT;
ALTER TABLE public.qa_tickets  ADD COLUMN IF NOT EXISTS label        TEXT DEFAULT 'once';
ALTER TABLE public.qa_tickets  ADD COLUMN IF NOT EXISTS recur_time   TEXT;
ALTER TABLE public.qa_tickets  ADD COLUMN IF NOT EXISTS template_id  TEXT;
ALTER TABLE public.qa_tickets  ADD COLUMN IF NOT EXISTS level        TEXT DEFAULT 'III';

-- ── Disable RLS (app handles auth internally) ─────────────────────
ALTER TABLE public.qa_users         DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_submissions   DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_profiles      DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_products      DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_user_products DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_tasks         DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_tickets       DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_notifications DISABLE ROW LEVEL SECURITY;

-- ── Grant API access to anon + authenticated roles ────────────────
GRANT ALL ON TABLE public.qa_users         TO anon, authenticated;
GRANT ALL ON TABLE public.qa_submissions   TO anon, authenticated;
GRANT ALL ON TABLE public.qa_profiles      TO anon, authenticated;
GRANT ALL ON TABLE public.qa_products      TO anon, authenticated;
GRANT ALL ON TABLE public.qa_user_products TO anon, authenticated;
GRANT ALL ON TABLE public.qa_tasks         TO anon, authenticated;
GRANT ALL ON TABLE public.qa_tickets       TO anon, authenticated;
GRANT ALL ON TABLE public.qa_notifications TO anon, authenticated;
