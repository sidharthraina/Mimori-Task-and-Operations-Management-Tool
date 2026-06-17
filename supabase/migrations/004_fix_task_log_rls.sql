-- ============================================================
-- 004 — Fix task_log INSERT/UPDATE RLS to enforce ownership
-- ============================================================
-- Problem: employee_insert_today_log did not enforce completed_by = auth.uid(),
-- so any active user could INSERT a log with completed_by = NULL.
-- The UPDATE policy allowed completed_by IS NULL as an escape hatch,
-- letting any active user hijack an unowned log entry.
-- Fix: enforce completed_by server-side on INSERT via trigger, and
-- tighten UPDATE to require completed_by = auth.uid() only.

-- 1. Drop the old policies
DROP POLICY IF EXISTS "employee_insert_today_log" ON public.task_logs;
DROP POLICY IF EXISTS "employee_update_own_today_log" ON public.task_logs;

-- 2. Recreate INSERT policy — completed_by must be the caller
CREATE POLICY "employee_insert_today_log" ON public.task_logs
  FOR INSERT WITH CHECK (
    public.is_active_user()
    AND log_date = current_date
    AND completed_by = auth.uid()
  );

-- 3. Recreate UPDATE policy — caller must own the row (no IS NULL escape)
CREATE POLICY "employee_update_own_today_log" ON public.task_logs
  FOR UPDATE USING (
    public.is_active_user()
    AND log_date = current_date
    AND completed_by = auth.uid()
  );

-- 4. Add BEFORE INSERT trigger to stamp completed_by server-side,
--    so client-supplied completed_by is always overwritten with auth.uid()
CREATE OR REPLACE FUNCTION public.stamp_insert_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  NEW.completed_by = auth.uid();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_task_logs_stamp_insert
  BEFORE INSERT ON public.task_logs
  FOR EACH ROW EXECUTE PROCEDURE public.stamp_insert_owner();
