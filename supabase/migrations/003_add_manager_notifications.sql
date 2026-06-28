-- ============================================================
-- 003 — Manager role, can_add_tasks, notifications
-- ============================================================

-- 1. Add 'manager' to user_role enum
-- NOTE: must be run in its own transaction before the rest of this migration,
-- because PostgreSQL cannot use a new enum value in the same transaction.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'manager';

COMMIT;

-- 2. Add can_add_tasks permission column to users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS can_add_tasks boolean NOT NULL DEFAULT false;

-- 3. Notifications table (one row per task per day, deduped)
CREATE TABLE IF NOT EXISTS public.notifications (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id     uuid        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  log_date    date        NOT NULL,
  message     text        NOT NULL,
  is_read     boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, log_date)
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_notifications" ON public.notifications
  FOR ALL TO authenticated
  USING  (public.is_admin())
  WITH CHECK (public.is_admin());

-- 4. Helper: is_manager()
CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'manager' AND active = true
  );
$$;

-- 5. Managers can read all tasks (full list, not just active)
CREATE POLICY "manager_read_tasks" ON public.tasks
  FOR SELECT TO authenticated
  USING (public.is_manager());

-- 6. Managers can read all task_logs (for reports dashboard)
CREATE POLICY "manager_read_all_task_logs" ON public.task_logs
  FOR SELECT TO authenticated
  USING (public.is_manager());

-- 7. Managers can read all users (for reports / user list)
CREATE POLICY "manager_read_all_users" ON public.users
  FOR SELECT TO authenticated
  USING (public.is_manager());

-- 8. Expand employee task_log read policy to cover the current week
--    (was today-only; grid needs Mon–Sun)
DROP POLICY IF EXISTS "employee_read_today_logs" ON public.task_logs;

CREATE POLICY "employee_read_week_logs" ON public.task_logs
  FOR SELECT TO authenticated
  USING (
    public.is_active_user()
    AND log_date >= (current_date - interval '6 days')
    AND log_date <= (current_date + interval '6 days')
  );

-- 9. Users granted can_add_tasks may INSERT new tasks
CREATE POLICY "permitted_users_insert_tasks" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND can_add_tasks = true AND active = true
    )
  );
