-- ============================================================
-- 009 — Whitelabel branding (business name + logo)
-- ============================================================
-- Runtime-configurable branding so whitelabeling doesn't require a
-- redeploy. Baseline (no logo configured) renders "Mimori" — see
-- src/components/ui/DashboardNav.tsx and src/app/(auth)/login/page.tsx.

CREATE TABLE public.business_settings (
  id            smallint    PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- singleton row
  business_name text        NOT NULL DEFAULT 'Mimori',
  logo_url      text,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_business_settings_updated_at
  BEFORE UPDATE ON public.business_settings
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

INSERT INTO public.business_settings (id, business_name) VALUES (1, 'Mimori');

ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_business_settings" ON public.business_settings
  FOR ALL USING (public.is_admin());

-- Public SELECT is required: the login page and the browser <title> must
-- resolve the business name/logo before the user is authenticated.
-- No sensitive data is exposed by this row.
CREATE POLICY "anyone_read_business_settings" ON public.business_settings
  FOR SELECT USING (true);

-- ----------------------------------------------------------------
-- STORAGE BUCKET for uploaded logos (public read, admin write).
-- If this INSERT is not permitted on your Supabase plan, create the
-- 'branding' bucket manually via Dashboard → Storage → New bucket
-- (public), then run the two policies below.
-- ----------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "public_read_branding" ON storage.objects
  FOR SELECT USING (bucket_id = 'branding');

CREATE POLICY "admin_write_branding" ON storage.objects
  FOR ALL USING (bucket_id = 'branding' AND public.is_admin());
