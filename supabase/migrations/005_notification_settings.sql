-- ============================================================
-- 005 — Admin notification preferences
-- ============================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS notif_individual_missed  boolean   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notif_batched_missed      boolean   NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS eod_report_time           time      NOT NULL DEFAULT '22:00',
  ADD COLUMN IF NOT EXISTS eod_report_email          text,
  ADD COLUMN IF NOT EXISTS last_eod_report_date      date;
