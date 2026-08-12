-- ============================================================
-- 007 — Task recurrence (custom interval) + soft assignment
-- ============================================================

-- ── Recurrence ──────────────────────────────────────────────
-- recurrence_unit = 'day'  → due every `recurrence_interval` days from recurrence_anchor_date
-- recurrence_unit = 'week' → due every `recurrence_interval` weeks; if recurrence_weekdays is
--                            set, restricted to those weekdays (0=Sun..6=Sat), else same
--                            weekday as recurrence_anchor_date
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS recurrence_unit        text NOT NULL DEFAULT 'day' CHECK (recurrence_unit IN ('day', 'week')),
  ADD COLUMN IF NOT EXISTS recurrence_interval     smallint NOT NULL DEFAULT 1 CHECK (recurrence_interval >= 1),
  ADD COLUMN IF NOT EXISTS recurrence_weekdays     smallint[],
  ADD COLUMN IF NOT EXISTS recurrence_anchor_date  date NOT NULL DEFAULT current_date;

-- ── Soft assignment (informational only — NOT enforced by RLS) ─
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS assigned_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

-- ── Required-proof flags (feed the "missing_proof" escalation trigger) ─
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS require_photo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_notes boolean NOT NULL DEFAULT false;

-- ----------------------------------------------------------------
-- Canonical due-date predicate — single Postgres source of truth.
-- KEEP IN SYNC WITH: src/lib/recurrence.ts → isTaskDueOn()
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_task_due(
  p_unit     text,
  p_interval smallint,
  p_weekdays smallint[],
  p_anchor   date,
  p_check    date
) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_check < p_anchor THEN false
    WHEN p_unit = 'day' THEN
      ((p_check - p_anchor) % GREATEST(p_interval, 1)::int) = 0
    WHEN p_unit = 'week' AND p_weekdays IS NOT NULL AND array_length(p_weekdays, 1) > 0 THEN
      EXTRACT(DOW FROM p_check)::smallint = ANY(p_weekdays)
      AND (FLOOR((p_check - date_trunc('week', p_anchor)::date) / 7)::int % GREATEST(p_interval, 1)::int) = 0
    WHEN p_unit = 'week' THEN
      EXTRACT(DOW FROM p_check) = EXTRACT(DOW FROM p_anchor)
      AND (FLOOR((p_check - date_trunc('week', p_anchor)::date) / 7)::int % GREATEST(p_interval, 1)::int) = 0
    ELSE false
  END;
$$;

-- Batched helper used by the check-missed-tasks edge function — one round trip
-- per store instead of per-task RPC calls.
CREATE OR REPLACE FUNCTION public.get_due_tasks(p_store_id uuid, p_date date)
RETURNS SETOF public.tasks LANGUAGE sql STABLE AS $$
  SELECT * FROM public.tasks
  WHERE store_id = p_store_id
    AND active = true
    AND public.is_task_due(recurrence_unit, recurrence_interval, recurrence_weekdays, recurrence_anchor_date, p_date);
$$;

-- No RLS changes needed: existing tasks policies (admin_all_tasks,
-- employee_read_tasks, manager_read_tasks, permitted_users_insert_tasks)
-- already cover all columns on the table.
