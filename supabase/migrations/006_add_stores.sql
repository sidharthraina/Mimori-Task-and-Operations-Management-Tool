-- ============================================================
-- 006 — Multi-store management
-- ============================================================

-- ── stores ───────────────────────────────────────────────────
CREATE TABLE public.stores (
  id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       text        NOT NULL,
  address    text,
  color      text        NOT NULL DEFAULT '#d6721e',
  is_default boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Only one store may be the default at a time
CREATE UNIQUE INDEX idx_stores_one_default ON public.stores (is_default) WHERE is_default = true;

CREATE TRIGGER trg_stores_updated_at
  BEFORE UPDATE ON public.stores
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- ── user ↔ store assignments ──────────────────────────────────
CREATE TABLE public.user_store_assignments (
  user_id    uuid        NOT NULL REFERENCES public.users(id)  ON DELETE CASCADE,
  store_id   uuid        NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, store_id)
);

-- ── add store_id to tasks and notifications ───────────────────
ALTER TABLE public.tasks
  ADD COLUMN store_id uuid REFERENCES public.stores(id) ON DELETE RESTRICT;

ALTER TABLE public.notifications
  ADD COLUMN store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_store_assignments ENABLE ROW LEVEL SECURITY;

-- Stores: admins see/manage all; staff read their assigned stores
CREATE POLICY "admin_all_stores" ON public.stores
  FOR ALL USING (public.is_admin());

CREATE POLICY "user_read_assigned_stores" ON public.stores
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_store_assignments
      WHERE user_id = auth.uid() AND store_id = stores.id
    )
  );

-- Assignments: admins manage all; users read their own
CREATE POLICY "admin_all_assignments" ON public.user_store_assignments
  FOR ALL USING (public.is_admin());

CREATE POLICY "user_read_own_assignments" ON public.user_store_assignments
  FOR SELECT USING (user_id = auth.uid());

-- ── Seed default store ────────────────────────────────────────
INSERT INTO public.stores (name, color, is_default)
VALUES ('Mimori - Store 1', '#d6721e', true);

-- Migrate existing tasks and notifications to the default store
UPDATE public.tasks
  SET store_id = (SELECT id FROM public.stores WHERE is_default = true);

UPDATE public.notifications
  SET store_id = (SELECT id FROM public.stores WHERE is_default = true);

-- Assign all existing users to the default store
INSERT INTO public.user_store_assignments (user_id, store_id)
SELECT u.id, s.id
FROM   public.users u, public.stores s
WHERE  s.is_default = true
ON CONFLICT DO NOTHING;

-- Enforce NOT NULL on tasks.store_id now that all rows are filled
ALTER TABLE public.tasks ALTER COLUMN store_id SET NOT NULL;
