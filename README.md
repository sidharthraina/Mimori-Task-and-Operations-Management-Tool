# Mimori — Task & Operations Management Tool

> A whitelabeled, multi-location task management platform for hospitality and retail operations teams.

---

## Product Overview

### The Problem

Multi-location food & beverage and retail businesses run on daily checklists — opening procedures, prep tasks, cleaning routines, closing checks. Today, most teams manage these through paper sheets, WhatsApp messages, or generic to-do apps that weren't built for operational accountability. The result: tasks slip through the cracks, no one knows who did what, managers find out about missed steps hours too late, and scaling to a second or third location adds more chaos rather than more control.

### What Mimori Solves

Mimori gives operations teams a single, structured platform to define, assign, and track recurring tasks across one or multiple store locations — with real-time visibility, accountability, and automated alerts for anything missed.

**Who it's for:**
- **Owners / Operators** who want a live view of task completion across all their locations, without needing to be on-site.
- **Store Managers** who need to monitor their team's daily checklist progress and catch problems early.
- **Frontline Staff** who need a clear, simple view of what's on their plate today — no clutter, no confusion.

---

### Core Features

| Feature | Description |
|---|---|
| **Per-store task checklists** | Each location runs its own daily checklist. Tasks are categorised (Opening, Setup, Prep, Cleaning, Closing) and scheduled by time. |
| **Multi-location management** | Admins manage all stores from one dashboard. Staff only see the store(s) they're assigned to. Switching between locations is a one-tap action. |
| **Role-based access** | Three roles — Admin, Manager, Staff — with granular permissions. Admins control who can access what. |
| **Photo proof of completion** | Staff can attach a photo directly from their device camera when marking a task done. Creates an audit trail without extra process. |
| **Missed task detection** | Automated checks every 20 minutes flag tasks not completed within their window. Admins receive an email alert before it becomes a problem. |
| **Real-time admin dashboard** | Live view of today's task status (Upcoming / Pending / Completed / Missed) updated the moment a staff member acts. Filterable by date and status. |
| **End-of-day report** | A nightly email summary with full breakdown: completion rates, categories, who completed what, and all missed tasks — delivered to the owner's inbox. |
| **Store theming** | Each location has a unique colour. The app's interface visually reflects the active store, so switching locations is immediately obvious at a glance. |

---

### Key Design Decisions

- **Whitelabel-ready** — The business name, branding, and store colours are fully configurable. The tool can be deployed as-is for any business, not just cafés.
- **Mobile-first** — Staff primarily use phones and tablets on the floor. Every screen is responsive, with a hamburger nav on small viewports and task cards designed for touch.
- **No training required** — The staff checklist is intentionally minimal: one page, grouped by category, tap to complete. There's no learning curve.
- **Accountability without surveillance** — Photo uploads and completion timestamps create a verifiable record without micromanagement culture.

---

## Technical Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────┐
│                        Browser / Device                  │
│                  Next.js 14 (App Router)                 │
│          Server Components + Client Components           │
└──────────────────────────┬──────────────────────────────┘
                           │  HTTPS
            ┌──────────────┴──────────────┐
            │                             │
     ┌──────▼──────┐             ┌────────▼────────┐
     │   Vercel    │             │    Supabase      │
     │  (Hosting)  │             │                  │
     │  Next.js    │◄────────────┤  PostgreSQL DB   │
     │  API Routes │  REST/SDK   │  Auth (JWT)      │
     └─────────────┘             │  Storage (S3)    │
                                 │  Edge Functions  │
                                 │  Realtime (WS)   │
                                 └────────┬─────────┘
                                          │
                                 ┌────────▼─────────┐
                                 │  GitHub Actions   │
                                 │  (Cron Scheduler) │
                                 │  → Edge Functions │
                                 └──────────────────┘
                                          │
                                 ┌────────▼─────────┐
                                 │  Resend           │
                                 │  (Transactional   │
                                 │   Email)          │
                                 └──────────────────┘
```

### Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | Next.js 14 (App Router), TypeScript | SSR + client interactivity |
| Styling | Tailwind CSS, Material Design 3 | UI component system |
| Auth | Supabase Auth (JWT + cookies) | Session management, Google OAuth |
| Database | Supabase PostgreSQL | Relational data + RLS |
| File Storage | Supabase Storage (S3-compatible) | Task photo uploads |
| Realtime | Supabase Realtime (WebSocket) | Live admin dashboard updates |
| API | Next.js API Routes (Edge-compatible) | Server-side privileged operations |
| Scheduled Jobs | GitHub Actions → Supabase Edge Functions (Deno) | Missed task checks, log purges |
| Email | Resend | Missed task alerts, EOD reports |
| Hosting | Vercel | Serverless deployment, CDN |

---

### Data Model

```
stores
  id, name, address, color, is_default, created_at, updated_at

users (mirrors auth.users)
  id, name, email, role (admin|manager|employee), active
  can_add_tasks, notif_individual_missed, notif_batched_missed
  eod_report_time, eod_report_email

user_store_assignments
  user_id → users.id
  store_id → stores.id
  (many-to-many: one user can be assigned to multiple stores)

tasks
  id, store_id → stores.id, title, description
  category (Opening|Setup|Prep|Cleaning|Closing|Other)
  scheduled_time, frequency (daily|weekly), active

task_logs
  id, task_id → tasks.id, log_date, status (done|pending|missed)
  completed_by → users.id, completed_at, photo_url

notifications
  id, store_id → stores.id, task_log_id → task_logs.id
  message, is_read, created_at
```

**Key constraints:**
- `stores.is_default` enforced as unique via a partial index (`WHERE is_default = true`) — only one default store at a time.
- `tasks.store_id` is `ON DELETE RESTRICT` — a store with tasks cannot be deleted without first removing or reassigning its tasks.
- `user_store_assignments` cascades on both sides — deleting a store or user cleans up assignments automatically.

---

### Authentication & Authorisation

**Session flow:**
1. User signs in via email/password or Google OAuth.
2. Supabase issues a JWT stored in an HTTP-only cookie (managed by `@supabase/ssr`).
3. `src/middleware.ts` intercepts every request, refreshes the session token if needed, and enforces route-level access (unauthenticated → `/login`; authenticated → role-appropriate page).
4. Server components call `supabase.auth.getUser()` to fetch the verified session and load the user's profile and store assignments.

**Row Level Security (RLS):**
All tables have RLS enabled. Key policies:
- `stores`: Admins read all rows; staff read only stores they have an entry in `user_store_assignments`.
- `tasks`: Read access scoped to the user's assigned stores.
- `task_logs`: Staff can insert/update their own logs; admins can read all.
- `notifications`: Admin-only read/write.

**Privileged operations** (creating/deleting auth users) are handled by Next.js API Routes that verify admin role server-side before calling Supabase with the service role key. The service role key never reaches the browser.

---

### Active Store & Multi-location Routing

The currently active store is persisted in a browser cookie (`active-store-id`, 30-day expiry). On every page render:

1. The dashboard layout (server component) reads the cookie.
2. It resolves the active store: `cookie → is_default → stores[0]`.
3. All data queries (tasks, logs, notifications) are filtered by `activeStore.id`.
4. The resolved store's hex colour is used to compute an 8% tint for the page background.
5. Client-side store switching sets the cookie and calls `router.refresh()` to trigger a full server re-render with the new store context.

---

### Scheduled Operations

Two Deno Edge Functions handle background work, invoked by GitHub Actions cron:

| Function | Schedule | Logic |
|---|---|---|
| `check-missed-tasks` | Every 20 min, Mon–Sat, 06:00–18:00 UTC | Finds active tasks whose `scheduled_time + 30 min` has passed with no `done` log for today. Marks them `missed`, writes a notification, and emails the admin (individually or batched, per preference). |
| `purge-old-logs` | Daily, 03:00 UTC | Deletes `task_logs` and their associated Storage objects (photos) older than 90 days. Keeps the database lean. |

Both functions are protected by a shared `FUNCTION_SECRET` header. GitHub Actions stores this as a repository secret and passes it on each invocation.

---

### Frontend Architecture

```
src/
├── app/
│   ├── (auth)/login/           # Public login page (Google OAuth + email)
│   ├── (dashboard)/
│   │   ├── layout.tsx          # Auth guard, store resolution, nav, tinted background
│   │   ├── tasks/              # Staff checklist (server-rendered, client toggle)
│   │   ├── admin/
│   │   │   ├── page.tsx        # Real-time task dashboard (WebSocket subscription)
│   │   │   ├── tasks/          # Task master list management
│   │   │   ├── users/          # Staff management + store assignments
│   │   │   └── stores/         # Store management (create, edit, theme, default)
│   │   └── employee/           # (alias route)
│   ├── api/
│   │   ├── admin/users/        # POST: create user, DELETE: remove user (service role)
│   │   └── notifications/      # PATCH: mark all read
│   └── layout.tsx              # Root layout (fonts, metadata)
├── components/
│   ├── ui/DashboardNav.tsx     # Sticky header, store switcher, profile modal, mobile menu
│   ├── admin/
│   │   ├── AdminDashboard.tsx  # Filterable task log table + realtime subscription
│   │   ├── AdminTasksClient.tsx
│   │   ├── AdminUsersClient.tsx
│   │   └── AdminStoresClient.tsx
│   └── employee/
│       ├── EmployeeChecklist.tsx  # Today's grouped task list with toggle + photo
│       └── PhotoUpload.tsx        # Camera capture / file picker
├── lib/
│   ├── supabase/client.ts      # Browser client (singleton)
│   ├── supabase/server.ts      # Server client (cookie-aware, per-request)
│   └── utils.ts                # formatTime, hexToTint, isOverdue, CATEGORY_ORDER
├── types/database.ts           # TypeScript interfaces for all DB entities
└── middleware.ts               # JWT refresh + auth redirect
```

**Rendering strategy:**
- Pages are server components by default — data fetched on the server, no client waterfall.
- Interactive client components (`'use client'`) handle toggles, modals, real-time updates, and form state.
- The admin dashboard uses a Supabase Realtime WebSocket subscription to push task log changes to all connected admins instantly, without polling.

---

### Design System

The UI follows **Material Design 3** guidelines (shape, elevation, component patterns) with a custom brand colour palette:

- **Buttons**: `rounded-full` stadium shape — filled (primary), outlined, text
- **Cards**: M3 Elevated style — `rounded-2xl`, `shadow-sm`, no border
- **Dialogs**: Extra Large shape (`rounded-[28px]`), 32% black scrim
- **Switches**: 52×32dp track, thumb grows from 16dp (off) to 24dp (on)
- **Typography**: Inter (body), Permanent Marker (brand wordmark), Roboto (UI labels)

---

## Setup & Deployment

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- A [Vercel](https://vercel.com) account
- A [Resend](https://resend.com) account (for email alerts)

### Local Development

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
# SUPABASE_SERVICE_ROLE_KEY, and FUNCTION_SECRET

# 3. Run database migrations (in Supabase SQL Editor, in order)
# supabase/migrations/001_initial_schema.sql
# supabase/migrations/002_seed_tasks.sql       ← optional
# supabase/migrations/003_add_manager_notifications.sql
# supabase/migrations/004_add_can_add_tasks.sql
# supabase/migrations/005_add_notifications_store.sql
# supabase/migrations/006_add_stores.sql

# 4. Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Creating the First Admin Account

1. **Supabase Dashboard → Auth → Users → Add user** — create an auth user manually.
2. In the SQL Editor, insert the profile row:
   ```sql
   INSERT INTO public.users (id, name, email, role)
   VALUES ('<auth-user-id>', 'Owner Name', 'owner@example.com', 'admin');

   INSERT INTO public.user_store_assignments (user_id, store_id)
   SELECT '<auth-user-id>', id FROM public.stores WHERE is_default = true;
   ```
3. Log in. All further staff accounts can be created from the app at `/admin/users`.

### Storage Setup

1. In Supabase Dashboard → Storage, create a private bucket named `task-photos`.
2. Run the Storage RLS policy block at the bottom of `001_initial_schema.sql`.

---

### Deploy to Vercel

```bash
vercel --prod
```

Or connect the GitHub repo in the Vercel dashboard for automatic deploys on push.

**Required environment variables:**

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API |
| `FUNCTION_SECRET` | Generate: `openssl rand -hex 32` |
| `RESEND_API_KEY` | [resend.com](https://resend.com) → API Keys |
| `EMAIL_FROM` | Your verified sender address in Resend |
| `ADMIN_EMAIL` | Owner's email for missed-task alerts |
| `NEXT_PUBLIC_BUSINESS_NAME` | Your business name (e.g. `Mimori`) |

---

### Edge Functions & Scheduled Jobs

```bash
# Install Supabase CLI and link project
brew install supabase/tap/supabase
supabase login
supabase link --project-ref <your-project-ref>

# Deploy functions
supabase functions deploy check-missed-tasks
supabase functions deploy purge-old-logs

# Set secrets
supabase secrets set FUNCTION_SECRET=<your-secret>
supabase secrets set RESEND_API_KEY=<your-resend-key>
supabase secrets set EMAIL_FROM=tasks@yourdomain.com
supabase secrets set ADMIN_EMAIL=owner@yourdomain.com
```

**GitHub Actions secrets** (repo → Settings → Secrets → Actions):

| Secret | Value |
|---|---|
| `SUPABASE_FUNCTION_SECRET` | Same as `FUNCTION_SECRET` |
| `EDGE_FUNCTION_URL_CHECK_MISSED` | `https://<project-ref>.supabase.co/functions/v1/check-missed-tasks` |
| `EDGE_FUNCTION_URL_PURGE_LOGS` | `https://<project-ref>.supabase.co/functions/v1/purge-old-logs` |

**Schedules:**

| Workflow | Cron (UTC) | Purpose |
|---|---|---|
| `check-missed-tasks.yml` | Every 20 min, Mon–Sat, 06:00–18:00 | Flag overdue tasks, alert admin |
| `purge-old-logs.yml` | Daily 03:00 | Delete logs and photos older than 90 days |

> **Timezone note:** GitHub Actions cron runs in UTC. Adjust the hours to match your local operating hours. E.g. for UTC+5:30 (IST), shift check window to 00:30–12:30 UTC.

---

## Roles & Permissions

| Capability | Staff | Manager | Admin |
|---|---|---|---|
| View today's task checklist | ✓ | ✓ | ✓ |
| Mark tasks complete / upload photos | ✓ | ✓ | ✓ |
| Add new tasks (if permitted by admin) | optional | optional | ✓ |
| View task master list | — | ✓ (read) | ✓ |
| Manage task master list | — | — | ✓ |
| View admin dashboard (all logs) | — | ✓ | ✓ |
| Manage staff accounts | — | — | ✓ |
| Manage stores | — | — | ✓ |
| Receive missed-task emails | — | — | ✓ |
| Switch between stores | if assigned to 2+ | if assigned to 2+ | always |

---

## Whitelabeling

To deploy Mimori for a different business:

1. Set `NEXT_PUBLIC_BUSINESS_NAME` in your environment variables.
2. Update the brand colour palette in `tailwind.config.ts` (`brand-*` tokens).
3. Update `EMAIL_FROM` and `ADMIN_EMAIL` to the new business's domain.
4. Replace or configure the store colour palette in `AdminStoresClient.tsx`.

No code changes are required for the name — it is read from the environment variable everywhere it appears (login page, header, footer, email subjects).

---

*Built with Next.js 14, Supabase, and Tailwind CSS. Designed to Material Design 3 specifications.*
