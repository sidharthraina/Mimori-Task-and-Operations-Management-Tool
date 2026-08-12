# Mimori — Task & Operations Management Tool

> A whitelabeled, multi-location task management platform for any business that runs on recurring checklists.

---

## Product Overview

### The Problem

Any business with a physical location and a routine — cafés, gyms, salons, clinics, retail stores, warehouses — runs on recurring checklists: opening procedures, equipment checks, cleaning routines, closing tasks. Most teams still manage these through paper sheets, WhatsApp messages, or generic to-do apps that weren't built for operational accountability. The result: tasks slip through the cracks, no one knows who did what, managers find out about missed steps hours too late, and opening a second or third location adds more chaos rather than more control.

### What Mimori Solves

Mimori gives operations teams a single, structured platform to define, assign, and track recurring tasks across one or multiple locations — with real-time visibility, photo-verified accountability, and automated escalation for anything missed.

**Who it's for:**
- **Owners / Operators** — gym owners, café owners, small retail chains, or anyone running multiple locations — who want a live view of task completion without needing to be on-site.
- **Store / Location Managers** who need to monitor their team's daily checklist progress and catch problems before they escalate.
- **Frontline Staff** who need a clear, simple view of what's on their plate today — no clutter, no training required.

It's built generically enough that "store" can mean a café, a gym floor, a clinic, a warehouse bay, or any other operating unit your business tracks — see [Whitelabeling](#whitelabeling) below.

---

### Core Features

| Feature | Description |
|---|---|
| **Per-location task checklists** | Each location runs its own checklist. Tasks are categorised (Opening, Setup, Prep, Cleaning, Closing) and scheduled by time. |
| **Flexible recurrence** | Tasks repeat every N days or every N weeks, optionally restricted to specific weekdays — not just "daily." A deep-clean every 3 days, a weigh-in every Monday and Thursday, whatever the operation needs. |
| **Multi-location management** | Admins manage all locations from one dashboard. Staff only see the location(s) they're assigned to. Switching between locations is a one-tap action, with a visible, theme-aware color cue so it's never ambiguous which location you're looking at. |
| **Role-based access** | Three roles — Admin, Manager, Staff — with granular permissions. Admins control who can access what. |
| **Photo proof of completion** | Staff can attach a photo directly from their device camera when marking a task done. Creates an audit trail without extra process. |
| **Configurable escalation chains** | Instead of a flat "email all admins" alert, define an ordered chain per location: notify the assignee, then a role, then a specific person — each after its own delay — triggered by a missed task or one completed without required proof. |
| **Missed task detection** | Automated checks every 20 minutes flag tasks not completed within their window and run them through the escalation chain. |
| **Real-time admin dashboard** | Live view of today's task status (Upcoming / Pending / Completed / Missed) updated the moment a staff member acts. Filterable by date and status. |
| **End-of-day report** | A nightly email summary with full breakdown: completion rates, categories, who completed what, and all missed tasks — delivered to the owner's inbox. |
| **Light & dark mode** | A full Material Design 3 color system generated from your brand color, in both light and dark, switchable per user (or left on "system"). |
| **Live whitelabel branding** | Business name and logo are editable from inside the app — no redeploy needed to rebrand. |

---

### Key Design Decisions

- **Whitelabel-ready** — Business name, logo, brand color, and location colors are fully configurable, most of it live from the app itself. Deploy it as-is for any business, not just one built around cafés.
- **Mobile-first** — Staff primarily use phones and tablets on the floor. Every screen is responsive, with a hamburger nav on small viewports and task cards designed for touch.
- **No training required** — The staff checklist is intentionally minimal: one page, grouped by category, tap to complete. There's no learning curve.
- **Accountability without surveillance** — Photo uploads and completion timestamps create a verifiable record without micromanagement culture.

---

## Technical Architecture

Mimori is a Next.js 14 (App Router) app on Vercel, backed by Supabase (Postgres, Auth, Storage, Realtime, Edge Functions), with scheduled checks run via GitHub Actions and email delivered through Resend. The UI implements a full Material Design 3 token system with light/dark theming.

For the full technical deep-dive — data model, recurrence engine, escalation matrix, auth/RLS, scheduled jobs, frontend structure, and the design system — see **[ARCHITECTURE.md](./ARCHITECTURE.md)**.

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
# supabase/migrations/007_recurrence_and_assignment.sql
# supabase/migrations/008_escalation_matrix.sql
# supabase/migrations/009_whitelabel_branding.sql

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
3. The `branding` bucket (for uploaded logos) is created automatically by `009_whitelabel_branding.sql` — see that file if your Supabase plan doesn't permit the automatic `storage.buckets` insert.

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
| `NEXT_PUBLIC_BUSINESS_NAME` | Your business name (initial seed only — see [Whitelabeling](#whitelabeling)) |

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
| `check-missed-tasks.yml` | Every 20 min, Mon–Sat, 06:00–18:00 | Flag overdue tasks, run the escalation chain |
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
| Manage locations | — | — | ✓ |
| Manage escalation chains | — | ✓ (read) | ✓ |
| Receive missed-task / escalation emails | — | if in a tier | if in a tier |
| Switch between locations | if assigned to 2+ | if assigned to 2+ | always |

---

## Whitelabeling

Mimori is designed to be forked and deployed for any business — the word "store" throughout the code and UI is just the generic name for whatever operating unit you track (a café, a gym, a clinic, a warehouse).

1. **Business name & logo** — as an admin, open your profile (avatar, top right) → **Settings** and set your business name and upload a logo. This replaces the "Mimori" wordmark in the nav and login page, live, with no redeploy. Leave it unset and the app shows "Mimori" as the baseline brand.
2. `NEXT_PUBLIC_BUSINESS_NAME` in your environment variables is only the *initial seed* value for the first deploy — after that, the Settings section in your profile is the source of truth.
3. **Brand color** — the whole Material Design 3 color system (light + dark) is generated algorithmically from one seed color. To rebrand, change the seed in `tailwind.config.ts` / `globals.css` (see [ARCHITECTURE.md § Design System](./ARCHITECTURE.md#10-design-system)) and regenerate the token set.
4. Update `EMAIL_FROM` and `ADMIN_EMAIL` to the new business's domain.
5. Replace or configure the location color palette in `AdminStoresClient.tsx`.

A small "Powered by Mimori" credit, linking back to this repository, always stays in the footer and on the login page — regardless of whitelabeling.

---

## License

[MIT](./LICENSE) — use it, fork it, run it for your own business, or build on top of it.

If you find it useful, a ⭐ on the repo is always appreciated.

---

*Built with Next.js 14, Supabase, and Tailwind CSS. Designed to Material Design 3 specifications.*
