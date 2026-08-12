# Technical Architecture

This document is the deep technical reference for Mimori. For a product overview, feature list, and setup instructions, see [README.md](./README.md).

---

## 1. System Overview

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
| Styling | Tailwind CSS, Material Design 3 tokens | UI component system, light/dark theming |
| Theming | `next-themes` | Persisted light/dark/system theme, SSR-safe (no hydration flash) |
| Auth | Supabase Auth (JWT + cookies) | Session management, Google OAuth |
| Database | Supabase PostgreSQL | Relational data + Row Level Security |
| File Storage | Supabase Storage (S3-compatible) | Task photos, uploaded logos |
| Realtime | Supabase Realtime (WebSocket) | Live admin dashboard updates |
| API | Next.js API Routes (Edge-compatible) | Server-side privileged operations |
| Scheduled Jobs | GitHub Actions → Supabase Edge Functions (Deno) | Missed-task checks, escalation, log purges |
| Email | Resend | Missed-task alerts, escalation alerts, EOD reports |
| Hosting | Vercel | Serverless deployment, CDN |

---

## 2. Data Model

```
stores
  id, name, address, color, is_default
  latitude, longitude, geofence_radius_meters   (all nullable — NULL = geofencing off)
  created_at, updated_at

business_settings                          (singleton row, id = 1)
  business_name, logo_url, updated_at

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
  scheduled_time, frequency
  recurrence_unit (day|week), recurrence_interval, recurrence_weekdays[], recurrence_anchor_date
  assigned_user_id → users.id (soft assignment, informational — not RLS-enforced)
  require_photo, require_notes
  escalation_rule_id → escalation_rules.id  (NULL = store default rule)
  active

task_logs
  id, task_id → tasks.id, log_date, status (done|pending|missed)
  completed_by → users.id, completed_at, photo_url, notes
  photo_lat, photo_lng, photo_outside_geofence   (captured at upload — soft flag only)

notifications
  id, store_id → stores.id, task_log_id → task_logs.id
  message, is_read, created_at

escalation_rules
  id, store_id → stores.id, name, is_default
  trigger_missed, trigger_missing_proof, active

escalation_tiers
  id, rule_id → escalation_rules.id, tier_order, delay_minutes
  recipient_type (assignee|role|specific_user)
  recipient_role, recipient_user_id → users.id

escalation_notifications
  id, task_id → tasks.id, log_date, tier_id → escalation_tiers.id
  recipient_id → users.id, trigger_type (missed|missing_proof)
  message, is_read, created_at
```

**Key constraints:**
- `stores.is_default` and `escalation_rules.is_default` are each enforced unique via a partial index (`WHERE is_default = true`, the latter scoped per store) — only one default at a time.
- `tasks.store_id` is `ON DELETE RESTRICT` — a store with tasks cannot be deleted without first removing or reassigning its tasks.
- `user_store_assignments` cascades on both sides — deleting a store or user cleans up assignments automatically.
- `escalation_tiers` has a `CHECK` constraint (`chk_recipient_shape`) enforcing exactly one recipient shape per tier — a role, a specific user, or "the task's assignee" — never more than one populated at once.
- `escalation_notifications` is a separate table from `notifications` (which the original missed-task bell relies on) specifically so the escalation feature could be added without touching that existing flow's `UNIQUE(task_id, log_date)` semantics.
- `stores.latitude/longitude` and `task_logs.photo_lat/photo_lng` are range-checked (`-90..90`, `-180..180`) at the database level, not just in the client form.

---

## 3. Recurrence Engine

Tasks are no longer fixed to "daily." Each task carries:

- `recurrence_unit`: `day` or `week`
- `recurrence_interval`: repeat every N days/weeks (e.g. every 3 days, every 2 weeks)
- `recurrence_weekdays`: optional array (0=Sun..6=Sat) restricting a weekly recurrence to specific days
- `recurrence_anchor_date`: the reference date the interval is calculated from

The due-date predicate is implemented **twice, deliberately kept in lockstep**:

1. **`public.is_task_due()`** — a Postgres SQL function (`supabase/migrations/007_recurrence_and_assignment.sql`), used by the `check-missed-tasks` Edge Function via `get_due_tasks()` RPC. Runs server-side, no round trip per task.
2. **`isTaskDueOn()`** in `src/lib/recurrence.ts` — a TypeScript mirror used by every client-facing view (staff checklist, weekly grid, admin dashboard) so due-date logic never leaves the browser for a page render.

Both files carry `KEEP IN SYNC WITH` comments pointing at each other. Any change to the recurrence rule must be made in both places.

---

## 4. Escalation Matrix

Replaces a flat "email all admins on miss" with an **admin-configurable, ordered chain of tiers**, per store, optionally overridden per task.

- Each **rule** (`escalation_rules`) belongs to a store, has a name, and can trigger on `missed` tasks, tasks completed **without** required photo/notes (`missing_proof`), or both.
- Each rule has an ordered list of **tiers** (`escalation_tiers`): "after N minutes, notify \<recipient\>" — where recipient is the task's assignee, a role (any admin/manager/employee), or one specific person.
- A task uses its store's default rule unless it has its own `escalation_rule_id` override.
- Delivery is logged per-recipient in `escalation_notifications`, de-duplicated via `UNIQUE(task_id, log_date, tier_id, recipient_id)` so a recipient is never notified twice for the same tier/incident.
- Every new store is seeded with a sensible 2-tier default: tier 1 → manager immediately, tier 2 → admin after 60 minutes.

Managed at `/admin/escalation` (`AdminEscalationClient.tsx`); admins can add/reorder/remove tiers, add rule sets per store, and set a store's default.

---

## 5. Geofenced Photo Checks

A **soft** location check on task-completion photos — nothing is ever blocked, only flagged for admin review.

- Each store optionally carries a `latitude` / `longitude` / `geofence_radius_meters`. All three are set together via "Use current location" + a radius in `AdminStoresClient.tsx`, or left blank to disable the feature entirely for that store.
- If a store hasn't configured geofencing, staff there are **never** prompted for their location — no permission dialog, nothing recorded. The prompt only appears when the feature is actually turned on.
- When it is enabled, `WeeklyGrid.tsx`'s photo-upload handler requests the browser's position (`src/lib/geo.ts` — a soft-fail wrapper: denied permission, timeout, or an unsupported browser all resolve to `null` rather than throwing) **in parallel with** the storage upload, so there's no added wait beyond what the upload already takes.
- The captured coordinates are compared against the store's center via a haversine `distanceMeters()` calculation; results beyond the radius set `task_logs.photo_outside_geofence = true`.
- Admins see a 📍⚠️ badge next to any flagged photo in the dashboard table, and a banner in the photo lightbox — that's the entire enforcement surface. A false "outside geofence" flag (indoor GPS drift, a device with a stale fix) never rejects a genuinely completed task; it just gets a second look.

---

## 6. Whitelabel Branding

Business name and logo are **runtime-configurable**, stored in the `business_settings` singleton row rather than baked into environment variables:

1. `NEXT_PUBLIC_BUSINESS_NAME` seeds the row on first migration run — it's only the initial fallback.
2. From then on, an admin edits business name and uploads a logo at Profile → Settings (`ProfileSettingsSection.tsx`), which writes directly to `business_settings` and to the public `branding` Storage bucket.
3. Every surface that shows the brand (nav wordmark, login page, `<title>`/metadata) reads from this table — no redeploy needed to rebrand.
4. If no logo is set, the app falls back to a stylized text wordmark using the business name.

A small "Powered by Mimori" credit, linking back to the source repository, always stays in the footer and on the login page regardless of whitelabeling — the one piece of branding that isn't configurable.

---

## 7. Authentication & Authorization

**Session flow:**
1. User signs in via email/password or Google OAuth.
2. Supabase issues a JWT stored in an HTTP-only cookie (managed by `@supabase/ssr`).
3. `src/middleware.ts` intercepts every request, refreshes the session token if needed, and enforces route-level access (unauthenticated → `/login`, with the public landing page at `/` and `/login` itself exempted; authenticated → role-appropriate page). See § 8 below.
4. Server components call `supabase.auth.getUser()` to fetch the verified session and load the user's profile and store assignments.
5. Signing out (`DashboardNav.tsx`'s `handleSignOut`) clears the session and returns the user to `/` — the public landing page, not `/login` — so the exit path lands somewhere that still makes sense to a logged-out visitor.

**Row Level Security (RLS):**
All tables have RLS enabled. Key policies:
- `stores`: Admins read all rows; staff read only stores they have an entry in `user_store_assignments`.
- `tasks`: Read access scoped to the user's assigned stores.
- `task_logs`: Staff can insert/update their own logs; admins can read all.
- `notifications` / `escalation_notifications`: Admin-only broad access; a recipient can read and mark-read only their own escalation notifications.
- `escalation_rules` / `escalation_tiers`: Admin read/write, manager read-only.
- `business_settings`: Admin write; **public read** (the login page and browser `<title>` must resolve the brand before the user is authenticated — no sensitive data lives in this row).

**Privileged operations** (creating/deleting auth users) are handled by Next.js API Routes that verify admin role server-side before calling Supabase with the service role key. The service role key never reaches the browser.

---

## 8. Public Landing Page & Entry Flow

`/` is the one route in the app that's intentionally public — a whitelabel-aware marketing page (`src/components/marketing/LandingPage.tsx`) explaining the product to a visitor who isn't signed in yet, so a forked deployment has a real front door instead of an immediate login wall.

- `src/middleware.ts` exempts `pathname === '/'` from its blanket "no session → redirect to `/login`" rule. Every other route stays gated.
- `src/app/page.tsx` branches on session state: an anonymous visitor gets `<LandingPage>` (props: `business_name`/`logo_url`, fetched the same way the login page does); an authenticated visitor is redirected onward exactly as before — `/admin` for admin/manager, `/tasks` for staff.
- The root layout sets `robots: { index: false, follow: false }` app-wide (the dashboard shouldn't be crawled), and `page.tsx` overrides that with its own `generateMetadata()` for `/` specifically — Next.js resolves metadata per-segment, so the most specific route wins for the fields it defines. This route is the only indexable page in the app.
- The landing page's hero mockup is built from the app's real `.card`/badge components and the real `CATEGORY_ORDER` constant (`src/lib/utils.ts`) rather than a screenshot or stock image, so it can't visually drift out of sync with the actual product.
- Signing out returns here (§ 7.5), not to `/login` — consistent with treating `/` as the app's actual home for a logged-out visitor.

---

## 9. Active Store & Multi-Location Routing

The currently active store is persisted in a browser cookie (`active-store-id`, 30-day expiry). On every page render:

1. The dashboard layout (server component) reads the cookie.
2. It resolves the active store: `cookie → is_default → stores[0]`.
3. All data queries (tasks, logs, notifications, escalation rules) are filtered by `activeStore.id`.
4. The resolved store's hex color drives two, deliberately separated, visual signals:
   - A **decorative accent** (a thin 3px strip under the header, and a small dot in the store switcher) — always the store's raw color, unaffected by theme.
   - A **subtle whole-page background wash** — computed at 8% via CSS `color-mix(in srgb, var(--store-accent) 8%, rgb(var(--background)))`, blended against the *current* M3 background token rather than a hardcoded white. This is what makes switching stores register at a glance without breaking dark mode (the earlier implementation tinted toward white unconditionally, which looked broken with a dark theme active).
5. Both signals transition over 500ms (`transition-colors duration-500`) so a store switch reads as a deliberate, visible change rather than an abrupt flash.
6. Client-side store switching sets the cookie and calls `router.refresh()` to trigger a full server re-render with the new store context — the CSS transition animates smoothly across that re-render since the wrapping element persists in the DOM.

---

## 10. Scheduled Operations

Two Deno Edge Functions handle background work, invoked by GitHub Actions cron:

| Function | Schedule | Logic |
|---|---|---|
| `check-missed-tasks` | Every 20 min, Mon–Sat, 06:00–18:00 UTC | Finds active, recurrence-due tasks whose `scheduled_time + 30 min` has passed with no `done` log for today. Marks them `missed`, evaluates each task's escalation chain (tier-by-tier, respecting each tier's delay), writes notifications, and emails recipients. |
| `purge-old-logs` | Daily, 03:00 UTC | Deletes `task_logs` and their associated Storage objects (photos) older than 90 days. Keeps the database lean. |

Both functions are protected by a shared `FUNCTION_SECRET` header. GitHub Actions stores this as a repository secret and passes it on each invocation.

---

## 11. Frontend Architecture

```
src/
├── app/
│   ├── page.tsx                  # "/" — public LandingPage for anonymous visitors, else redirect to dashboard
│   ├── (auth)/login/            # Public login page (Google OAuth + email)
│   ├── (dashboard)/
│   │   ├── layout.tsx           # Auth guard, store resolution, nav, store-tinted background
│   │   ├── tasks/                # Staff checklist (server-rendered, client toggle)
│   │   ├── admin/
│   │   │   ├── page.tsx          # Real-time task dashboard (WebSocket subscription)
│   │   │   ├── tasks/             # Task master list management
│   │   │   ├── users/             # Staff management + store assignments
│   │   │   ├── stores/            # Store management (create, edit, theme, default)
│   │   │   └── escalation/        # Escalation rule/tier management
│   │   └── employee/             # (alias route)
│   ├── api/
│   │   ├── admin/users/           # POST: create user, DELETE: remove user (service role)
│   │   ├── notifications/         # PATCH: mark all read
│   │   └── escalation-notifications/  # PATCH: mark all read (per-recipient)
│   └── layout.tsx                # Root layout (fonts, ThemeProvider, metadata)
├── components/
│   ├── auth/LoginForm.tsx        # Client login form
│   ├── marketing/LandingPage.tsx # Public "/" marketing page — features, who-it's-for, CTAs
│   ├── ui/
│   │   ├── DashboardNav.tsx       # Sticky header, store switcher, profile modal, mobile menu, theme toggle
│   │   ├── ProfileNotificationsSection.tsx  # Missed + escalation notification feed
│   │   └── ProfileSettingsSection.tsx        # Branding (business name + logo) editor
│   ├── admin/
│   │   ├── AdminDashboard.tsx     # Filterable task log table + realtime subscription
│   │   ├── AdminTasksClient.tsx
│   │   ├── TaskFormFields.tsx     # Shared task create/edit form (recurrence, assignment, proof, escalation override)
│   │   ├── AdminUsersClient.tsx
│   │   ├── AdminStoresClient.tsx
│   │   └── AdminEscalationClient.tsx
│   └── employee/
│       ├── EmployeeChecklist.tsx  # Today's grouped task list with toggle + photo
│       └── PhotoUpload.tsx        # Camera capture trigger
├── lib/
│   ├── supabase/client.ts        # Browser client (singleton)
│   ├── supabase/server.ts        # Server client (cookie-aware, per-request)
│   ├── recurrence.ts             # isTaskDueOn(), describeRecurrence() — TS mirror of the SQL predicate
│   ├── geo.ts                    # getCurrentPosition() (soft-fail), distanceMeters() (haversine)
│   └── utils.ts                  # cn, formatTime, formatDate, isOverdue, CATEGORY_ORDER
├── types/database.ts             # TypeScript interfaces for all DB entities
└── middleware.ts                 # JWT refresh + auth redirect, "/" exempted as public
```

**Rendering strategy:**
- Pages are server components by default — data fetched on the server, no client waterfall.
- Interactive client components (`'use client'`) handle toggles, modals, real-time updates, and form state.
- The admin dashboard uses a Supabase Realtime WebSocket subscription to push task log changes to all connected admins instantly, without polling.

**Nav stability:** the store switcher and the profile name/avatar in `DashboardNav.tsx` are both rendered in fixed-width containers with internal text truncation. Store names and staff names are arbitrary-length user data — without a fixed width, switching to a store or user with a longer/shorter name would reflow the rest of the nav bar (Dashboard/Tasks/Staff links visibly shifting). The nav's static link labels don't need this treatment since their text never changes at runtime.

**Profile modal save flow:** each form inside the Profile modal (Account, Email Alerts) tracks its own "saved" flag. On successful save, the Save button morphs into a Close button in place (with an explicit "you can close this now" prompt) rather than auto-dismissing on a timer — editing any field afterward immediately reverts it back to Save and clears the stale message.

---

## 12. Design System

The UI follows **Material Design 3** — color roles, elevation, shape, and type scale — generated algorithmically from a single brand seed color, blended with a softer, modern-SaaS surface treatment rather than a stock Android look.

### Color tokens

All M3 roles (`primary`, `secondary`, `tertiary`, `error`, plus two custom roles — `success` and `warning`, which M3 doesn't define natively — each with an `on-`, `-Container`, and `on-Container` pair) are generated from the brand seed via Google's [`@material/material-color-utilities`](https://www.npmjs.com/package/@material/material-color-utilities) (`SchemeTonalSpot`), for both light and dark palettes at once.

Tokens are defined as CSS custom properties (`R G B` triplets) in `globals.css` under `:root` and `.dark`, and exposed to Tailwind via `rgb(var(--token) / <alpha-value>)` functions in `tailwind.config.ts` — the standard pattern for runtime-toggleable, many-named colors without duplicating every utility with `dark:` variants. This is also why the app has **zero `dark:`-prefixed Tailwind classes anywhere** — a component just uses `bg-surface` or `text-onSurface` and it's correct in both themes automatically.

### Theming

Dark mode is handled by `next-themes` (`class` strategy, `system` default, `enableSystem`), toggled via a Light/Dark/System control tucked into the Profile modal's Account tab — deliberately kept out of the primary nav bar, which is reserved for navigation and store context.

### Shape, elevation, type

- **Buttons**: `rounded-full` stadium shape — filled (primary), tonal, outlined, ghost variants.
- **Cards**: `rounded-2xl`, `shadow-elevation-1` (M3 elevation level 1), `bg-surfaceContainerLow`.
- **Modals**: `rounded-modal` (28px, M3 "extra large" shape), `shadow-elevation-3`, `bg-surfaceContainerHigh`.
- **Elevation scale**: 3 neutral, un-tinted shadow levels (cards → dropdowns/popovers → modals), matching M3's structure with a softer shadow treatment.
- **Typography**: Roboto (body/UI, weights 300–700, M3's default typeface) for everything by default; Alata (`font-heading`, weight 400 only — it has no bold cut, so heading elements drop `font-bold`/`font-semibold` rather than let the browser synthesize a fake one) for page titles and modal/section headings specifically; Permanent Marker (brand wordmark only, nowhere else).

### Deliberate exceptions

The in-app camera capture overlay (`CameraCapture.tsx`) and its trigger (`PhotoUpload.tsx`) are **intentionally excluded** from the token system — a literal black overlay with a white shutter button, regardless of theme, matching the universal camera-UI convention (iOS Camera, Instagram, WhatsApp). Both files carry a comment flagging this as deliberate.

---

## 13. Notable Engineering Decisions

- **Recurrence and escalation logic live in two places on purpose** (SQL + TypeScript) rather than one, so that server-side scheduled jobs and client-rendered views never need a network round trip just to answer "is this task due today" — the tradeoff is an explicit sync discipline, documented via matching code comments in both files.
- **Store identity vs. the design system**: an earlier version tinted the *entire* page background directly from each store's admin-picked color, which fought with M3's own surface-elevation system and wasn't contrast-checked per store. The current approach keeps the store-color wash intentionally subtle (8%, via `color-mix()` against the live theme background) — enough to notice a store switch, not enough to fight card/surface elevation.
- **Escalation notifications are a separate table from the original `notifications` table**, not a schema migration of it — avoiding any risk to the existing missed-task bell's `UNIQUE(task_id, log_date)` behavior while adding a materially different (per-recipient, per-tier) delivery model.
- **Branding is DB-backed, not env-var-backed**, specifically so a new store owner can whitelabel the app from the UI at 2am without needing a redeploy or touching Vercel's dashboard.
- **Geofencing is opt-in and soft by construction**, not because location accuracy couldn't support a hard block, but because a false rejection on a genuinely completed task is a worse failure mode than a flagged one an admin can glance at — and because prompting for location at a store that never asked for it would be a privacy overreach for no benefit.
- **The public landing page reuses real app components for its hero visual** instead of a screenshot, so the marketing page cannot show a UI that no longer exists — it's generated from the same design tokens and constants as the product itself.
