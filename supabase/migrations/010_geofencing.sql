-- ============================================================
-- 010 — Optional geofencing on task-completion photos
-- ============================================================
-- Soft implementation: nothing is blocked. If a store has a location and
-- radius configured, each photo upload's captured coordinates (best-effort,
-- browser geolocation — permission can be denied) are compared against it
-- and out-of-range submissions are flagged for admin review, not rejected.
-- Leaving a store's latitude/longitude/geofence_radius_meters unset disables
-- the feature for that store entirely (no location is ever requested from
-- staff at a store that hasn't opted in).

-- ── Per-store geofence configuration (all optional — NULL = disabled) ──
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS latitude               double precision CHECK (latitude BETWEEN -90 AND 90),
  ADD COLUMN IF NOT EXISTS longitude              double precision CHECK (longitude BETWEEN -180 AND 180),
  ADD COLUMN IF NOT EXISTS geofence_radius_meters  integer CHECK (geofence_radius_meters > 0);

-- ── Per-photo captured location + flag ──────────────────────────
ALTER TABLE public.task_logs
  ADD COLUMN IF NOT EXISTS photo_lat               double precision CHECK (photo_lat BETWEEN -90 AND 90),
  ADD COLUMN IF NOT EXISTS photo_lng               double precision CHECK (photo_lng BETWEEN -180 AND 180),
  ADD COLUMN IF NOT EXISTS photo_outside_geofence  boolean NOT NULL DEFAULT false;

-- No RLS changes needed: these are new columns on tables whose existing
-- row-level policies (stores, task_logs) already cover them.
