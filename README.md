# Mimori - Task and Operations Management Tool (Single and Multi store)

Internal staff task management app for any business. Built with Next.js 14 (App Router), Tailwind CSS, and Supabase.

---

## Stack

- **Frontend**: Next.js 14 (App Router, TypeScript), Tailwind CSS
- **Backend/DB**: Supabase (Postgres, Auth, Storage, Edge Functions)
- **Hosting**: Vercel
- **Scheduled jobs**: GitHub Actions → Supabase Edge Functions

---

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env.local
# Fill in all values in .env.local

# 3. Run dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Database Setup (Supabase)

1. Create a new project at [supabase.com](https://supabase.com).
2. In the SQL Editor, run the migrations in order:
   ```
   supabase/migrations/001_initial_schema.sql
   supabase/migrations/002_seed_tasks.sql   ← optional starter tasks
   ```
3. Enable Storage and create a bucket named `task-photos` (private).
4. Uncomment the Storage RLS policy block at the bottom of `001_initial_schema.sql` and run it.

### Creating the first admin account

After running migrations, create the first admin directly in Supabase:

1. **Supabase Dashboard → Auth → Users → Add user** — create an auth user.
2. In the SQL Editor, insert the profile:
   ```sql
   insert into public.users (id, name, email, role)
   values ('<auth-user-id>', 'Owner Name', 'owner@example.com', 'admin');
   ```
3. After that, the admin can create employee accounts from the app at `/admin/users`.

---

## Deploy to Vercel

```bash
# Install Vercel CLI (optional)
npm i -g vercel

# Deploy
vercel --prod
```

Or connect the GitHub repo in the [Vercel dashboard](https://vercel.com) for automatic deploys.

### Required Vercel Environment Variables

Set these in **Vercel → Project → Settings → Environment Variables**:

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API |
| `RESEND_API_KEY` | [resend.com](https://resend.com) → API Keys |
| `EMAIL_FROM` | Your verified sender domain in Resend |
| `ADMIN_EMAIL` | Owner's email for missed-task alerts |

---

## Edge Functions Setup

Edge Functions live in `supabase/functions/`. Deploy them with the Supabase CLI:

```bash
# Install Supabase CLI
brew install supabase/tap/supabase   # macOS
# or: npm install -g supabase

# Log in and link project
supabase login
supabase link --project-ref your-project-ref

# Deploy both functions
supabase functions deploy check-missed-tasks
supabase functions deploy purge-old-logs
```

### Set Edge Function Secrets

```bash
# Generate a strong secret
openssl rand -hex 32

# Set secrets for both functions
supabase secrets set FUNCTION_SECRET=<your-secret>
supabase secrets set RESEND_API_KEY=<your-resend-key>
supabase secrets set EMAIL_FROM=tasks@yourdomain.com
supabase secrets set ADMIN_EMAIL=owner@yourdomain.com
```

These are automatically available as `Deno.env.get(...)` inside the functions. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically by the Supabase runtime.

### Test a function locally

```bash
supabase functions serve check-missed-tasks --env-file .env.local

curl -X POST http://localhost:54321/functions/v1/check-missed-tasks \
  -H "x-function-secret: your-secret"
```

---

## GitHub Actions — Scheduled Invocations

The two workflow files in `.github/workflows/` invoke the Edge Functions on a schedule.

### Required GitHub Actions Secrets

Go to **GitHub repo → Settings → Secrets and variables → Actions → New repository secret**:

| Secret name | Value |
|---|---|
| `SUPABASE_FUNCTION_SECRET` | Same value as `FUNCTION_SECRET` above |
| `EDGE_FUNCTION_URL_CHECK_MISSED` | `https://<project-ref>.supabase.co/functions/v1/check-missed-tasks` |
| `EDGE_FUNCTION_URL_PURGE_LOGS` | `https://<project-ref>.supabase.co/functions/v1/purge-old-logs` |

### Schedules

| Workflow | Schedule | Purpose |
|---|---|---|
| `check-missed-tasks.yml` | Every 20 min, Mon–Sat, 6 AM–6 PM UTC | Marks overdue tasks as "missed", emails admin |
| `purge-old-logs.yml` | Daily at 3 AM UTC | Deletes logs + photos older than 90 days |

> **Timezone note:** GitHub Actions cron runs in UTC. If your café is in a different timezone, adjust the cron hours accordingly. For example, UTC-5 (EST): shift hours +5 (so 6 AM local = 11 AM UTC).

You can also trigger either workflow manually from **GitHub → Actions → [workflow name] → Run workflow**.

---

## Project Structure

```
darkbean-café/
├── src/
│   ├── app/
│   │   ├── (auth)/login/          # Login page
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx         # Shared nav + auth guard
│   │   │   ├── employee/          # Employee checklist
│   │   │   └── admin/             # Admin dashboard, tasks, users
│   │   ├── api/admin/users/       # Server-side user creation
│   │   └── layout.tsx
│   ├── components/
│   │   ├── employee/              # EmployeeChecklist, PhotoUpload
│   │   ├── admin/                 # AdminDashboard, AdminTasksClient, AdminUsersClient
│   │   └── ui/                    # DashboardNav
│   ├── lib/
│   │   ├── supabase/client.ts     # Browser Supabase client
│   │   ├── supabase/server.ts     # Server Supabase client
│   │   └── utils.ts               # Helpers
│   ├── types/database.ts          # TypeScript types
│   └── middleware.ts              # Auth + role routing
├── supabase/
│   ├── migrations/                # SQL schema + seed
│   └── functions/
│       ├── check-missed-tasks/    # Mark missed tasks, email admin
│       └── purge-old-logs/        # Delete old logs + photos
└── .github/workflows/             # GitHub Actions cron jobs
```

---

## Roles

| Role | Can do |
|---|---|
| `employee` | View + complete today's tasks, upload photos |
| `admin` | Everything above + view all history, manage tasks and users, see missed/overdue alerts |

---

## Resend Setup

1. Sign up at [resend.com](https://resend.com).
2. Add and verify your sending domain.
3. Create an API key and add it to Vercel env vars and Supabase Edge Function secrets.
4. Update `EMAIL_FROM` to a verified address on your domain.
# cafe-task-management-tool
