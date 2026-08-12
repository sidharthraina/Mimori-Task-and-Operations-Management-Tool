-- ============================================================
-- 008 — Configurable escalation matrix
-- ============================================================
-- Replaces the flat "notify all admins" missed-task alert with an
-- admin-editable, ordered chain of tiers (role or specific person,
-- each with its own delay), triggerable on missed tasks and/or
-- tasks completed without a required photo/notes.

-- ── escalation_rules ─────────────────────────────────────────
CREATE TABLE public.escalation_rules (
  id                    uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id              uuid        NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name                  text        NOT NULL DEFAULT 'Default',
  is_default            boolean     NOT NULL DEFAULT false,
  trigger_missed        boolean     NOT NULL DEFAULT true,
  trigger_missing_proof boolean     NOT NULL DEFAULT false,
  active                boolean     NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Only one default rule per store
CREATE UNIQUE INDEX idx_escalation_rules_one_default_per_store
  ON public.escalation_rules (store_id) WHERE is_default = true;

CREATE TRIGGER trg_escalation_rules_updated_at
  BEFORE UPDATE ON public.escalation_rules
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- ── escalation_tiers ─────────────────────────────────────────
CREATE TABLE public.escalation_tiers (
  id                uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  rule_id           uuid        NOT NULL REFERENCES public.escalation_rules(id) ON DELETE CASCADE,
  tier_order        smallint    NOT NULL,
  delay_minutes     integer     NOT NULL DEFAULT 0 CHECK (delay_minutes >= 0),
  recipient_type    text        NOT NULL CHECK (recipient_type IN ('assignee', 'role', 'specific_user')),
  recipient_role    user_role,
  recipient_user_id uuid        REFERENCES public.users(id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rule_id, tier_order),
  CONSTRAINT chk_recipient_shape CHECK (
    (recipient_type = 'role'          AND recipient_role IS NOT NULL AND recipient_user_id IS NULL) OR
    (recipient_type = 'specific_user' AND recipient_user_id IS NOT NULL AND recipient_role IS NULL) OR
    (recipient_type = 'assignee'      AND recipient_role IS NULL AND recipient_user_id IS NULL)
  )
);

-- ── per-task escalation override ────────────────────────────
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS escalation_rule_id uuid REFERENCES public.escalation_rules(id) ON DELETE SET NULL;
-- NULL = use the task's store default rule (is_default = true)

-- ── escalation_notifications ────────────────────────────────
-- Per-recipient delivery + de-dupe log. Kept separate from the existing
-- `notifications` table (which has UNIQUE(task_id, log_date) relied on by
-- the admin bell / /api/notifications route) to avoid touching that flow.
CREATE TABLE public.escalation_notifications (
  id           uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id      uuid        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  log_date     date        NOT NULL,
  tier_id      uuid        NOT NULL REFERENCES public.escalation_tiers(id) ON DELETE CASCADE,
  recipient_id uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  trigger_type text        NOT NULL CHECK (trigger_type IN ('missed', 'missing_proof')),
  message      text        NOT NULL,
  is_read      boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, log_date, tier_id, recipient_id)
);

CREATE INDEX idx_escalation_notifications_recipient ON public.escalation_notifications (recipient_id, is_read);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.escalation_rules         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalation_tiers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalation_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_escalation_rules" ON public.escalation_rules
  FOR ALL USING (public.is_admin());
CREATE POLICY "manager_read_escalation_rules" ON public.escalation_rules
  FOR SELECT USING (public.is_manager());

CREATE POLICY "admin_all_escalation_tiers" ON public.escalation_tiers
  FOR ALL USING (public.is_admin());
CREATE POLICY "manager_read_escalation_tiers" ON public.escalation_tiers
  FOR SELECT USING (public.is_manager());

CREATE POLICY "admin_all_escalation_notifications" ON public.escalation_notifications
  FOR ALL USING (public.is_admin());
CREATE POLICY "recipient_read_own_escalation_notifications" ON public.escalation_notifications
  FOR SELECT USING (recipient_id = auth.uid());
CREATE POLICY "recipient_mark_own_escalation_notifications_read" ON public.escalation_notifications
  FOR UPDATE USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());

-- ── Seed a sensible 2-tier default chain for every existing store ──
INSERT INTO public.escalation_rules (store_id, name, is_default, trigger_missed)
SELECT id, 'Default', true, true FROM public.stores;

INSERT INTO public.escalation_tiers (rule_id, tier_order, delay_minutes, recipient_type, recipient_role)
SELECT id, 1, 0,  'role', 'manager'::user_role FROM public.escalation_rules WHERE is_default = true
UNION ALL
SELECT id, 2, 60, 'role', 'admin'::user_role   FROM public.escalation_rules WHERE is_default = true;
