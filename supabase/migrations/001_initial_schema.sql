-- ============================================================
-- Café Task Management — Initial Schema Migration
-- ============================================================

-- ----------------------------------------------------------------
-- Enable UUID extension
-- ----------------------------------------------------------------
create extension if not exists "uuid-ossp";

-- ----------------------------------------------------------------
-- ENUM TYPES
-- ----------------------------------------------------------------
create type task_category as enum ('Opening', 'Cleaning', 'Setup', 'Prep', 'Closing', 'Other');
create type task_frequency as enum ('daily');
create type log_status as enum ('pending', 'done', 'missed');
create type user_role as enum ('employee', 'admin');

-- ----------------------------------------------------------------
-- USERS (extends Supabase auth.users)
-- ----------------------------------------------------------------
create table public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  email       text not null unique,
  role        user_role not null default 'employee',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------
-- TASKS (master checklist)
-- ----------------------------------------------------------------
create table public.tasks (
  id              uuid primary key default uuid_generate_v4(),
  title           text not null,
  description     text,
  category        task_category not null default 'Other',
  scheduled_time  time not null,        -- e.g. '08:00'
  frequency       task_frequency not null default 'daily',
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ----------------------------------------------------------------
-- TASK_LOGS (daily instances)
-- ----------------------------------------------------------------
create table public.task_logs (
  id              uuid primary key default uuid_generate_v4(),
  task_id         uuid not null references public.tasks(id) on delete cascade,
  log_date        date not null default current_date,
  status          log_status not null default 'pending',
  completed_by    uuid references public.users(id) on delete set null,
  completed_at    timestamptz,
  photo_url       text,
  notes           text,
  created_at      timestamptz not null default now(),
  -- one log per task per day
  unique (task_id, log_date)
);

-- ----------------------------------------------------------------
-- INDEXES
-- ----------------------------------------------------------------
create index idx_task_logs_date     on public.task_logs (log_date);
create index idx_task_logs_status   on public.task_logs (status);
create index idx_task_logs_task_id  on public.task_logs (task_id);
create index idx_tasks_active       on public.tasks (active);
create index idx_tasks_category     on public.tasks (category);

-- ----------------------------------------------------------------
-- UPDATED_AT TRIGGER
-- ----------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_users_updated_at
  before update on public.users
  for each row execute procedure public.set_updated_at();

create trigger trg_tasks_updated_at
  before update on public.tasks
  for each row execute procedure public.set_updated_at();

-- ----------------------------------------------------------------
-- AUTO-STAMP completed_at ON STATUS → done
-- ----------------------------------------------------------------
create or replace function public.stamp_completed_at()
returns trigger language plpgsql security definer as $$
begin
  if new.status = 'done' and old.status != 'done' then
    new.completed_at = now();
    new.completed_by = auth.uid();
  end if;
  -- clear stamp if reverted (edge case)
  if new.status != 'done' and old.status = 'done' then
    new.completed_at = null;
    new.completed_by = null;
  end if;
  return new;
end;
$$;

create trigger trg_task_logs_stamp
  before update on public.task_logs
  for each row execute procedure public.stamp_completed_at();

-- ----------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ----------------------------------------------------------------
alter table public.users     enable row level security;
alter table public.tasks     enable row level security;
alter table public.task_logs enable row level security;

-- Helper: is caller an admin?
create or replace function public.is_admin()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'admin' and active = true
  );
$$;

-- Helper: is caller an active employee (or admin)?
create or replace function public.is_active_user()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and active = true
  );
$$;

-- ---- USERS policies ----
-- Admins: full access
create policy "admin_all_users" on public.users
  for all using (public.is_admin());

-- Users: read own row
create policy "user_read_self" on public.users
  for select using (id = auth.uid());

-- ---- TASKS policies ----
-- Admins: full CRUD
create policy "admin_all_tasks" on public.tasks
  for all using (public.is_admin());

-- Employees: read active tasks only
create policy "employee_read_tasks" on public.tasks
  for select using (public.is_active_user() and active = true);

-- ---- TASK_LOGS policies ----
-- Admins: full access to all logs
create policy "admin_all_task_logs" on public.task_logs
  for all using (public.is_admin());

-- Employees: read today's logs
create policy "employee_read_today_logs" on public.task_logs
  for select using (
    public.is_active_user() and log_date = current_date
  );

-- Employees: insert log for today (completed_by must be themselves)
create policy "employee_insert_today_log" on public.task_logs
  for insert with check (
    public.is_active_user()
    and log_date = current_date
  );

-- Employees: update only their own today's log
create policy "employee_update_own_today_log" on public.task_logs
  for update using (
    public.is_active_user()
    and log_date = current_date
    and (completed_by = auth.uid() or completed_by is null)
  );

-- ----------------------------------------------------------------
-- STORAGE BUCKET (run after enabling Storage in Supabase dashboard)
-- ----------------------------------------------------------------
-- insert into storage.buckets (id, name, public) values ('task-photos', 'task-photos', false);

-- Storage RLS: employees can upload to their own folder, admins read all
-- create policy "employee_upload_photo" on storage.objects
--   for insert with check (
--     bucket_id = 'task-photos'
--     and auth.uid()::text = (storage.foldername(name))[1]
--   );
-- create policy "admin_read_photos" on storage.objects
--   for select using (
--     bucket_id = 'task-photos' and public.is_admin()
--   );
-- create policy "employee_read_own_photos" on storage.objects
--   for select using (
--     bucket_id = 'task-photos'
--     and auth.uid()::text = (storage.foldername(name))[1]
--   );
