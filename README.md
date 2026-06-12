# Duty Manager

Web app for managing teacher duty rosters: admin schedules slots, teachers
self-book within their quota, and attendance is captured either by teachers
themselves or by a monitor walking the building.

Stack: **React + TypeScript + Vite**, **Tailwind v4**, **Supabase**
(Postgres + Auth + Edge Functions + Realtime), deployed on **Vercel**.

---

## 1. Create the Supabase project

1. Go to <https://supabase.com> and create a new project. Pick a region close
   to your users. Save the database password somewhere safe.
2. In **Project Settings → API**, copy:
   - `Project URL` → goes into both `VITE_SUPABASE_URL` and `SUPABASE_URL`
   - `anon` `public` key → `VITE_SUPABASE_ANON_KEY`
   - `service_role` `secret` key → `SUPABASE_SERVICE_ROLE_KEY`
     (Node-side only. Never expose to the browser.)
3. Copy `.env.example` to `.env.local` and fill in those four values.

## 2. Apply the database migrations

The migrations live in [`supabase/migrations/`](supabase/migrations/) and are
ordered by filename. Pick one:

**Option A — Supabase CLI (recommended):**

```bash
brew install supabase/tap/supabase   # or see https://supabase.com/docs/guides/cli
supabase link --project-ref <your-ref>
supabase db push
```

**Option B — SQL Editor:** open each `.sql` file in numeric order and paste it
into the Supabase Studio SQL Editor.

The migrations create all tables, row-level security policies, the SECURITY
DEFINER RPCs (`book_slot`, `cancel_booking`, `mark_attendance`, etc.), and
turn on realtime for the attendance table.

## 3. Deploy the Edge Functions

Two Edge Functions live in [`supabase/functions/`](supabase/functions/):

- `staff-upload` — admin uploads a CSV; upserts staff and creates auth accounts
- `admin-reset-password` — admin resets a teacher's password to `Wso2026!`

Both verify the caller is `is_admin=true` before doing anything.

```bash
supabase functions deploy staff-upload
supabase functions deploy admin-reset-password
```

## 4. Bootstrap the first admin

There must be at least one admin profile before the Admin Portal is usable.
Run:

```bash
npm install
npm run bootstrap:admin -- 9999   # replace 9999 with whatever emp_no you want
```

That creates an auth user `9999@duty.internal` with password `Wso2026!`
and a profile with `is_admin=true` (no staff record).

Sign in at `/login` with **Emp No `9999`** and **password `Wso2026!`**.

## 5. (Optional) Seed staff from CSV via the command line

Before the Admin Portal is live, you can bulk-seed staff from the command
line — does the same thing as the in-app uploader:

```bash
npm run seed:staff -- scripts/sample-staff.csv
```

CSV columns: `emp_no,name,department,duty_quota_break,duty_quota_lunch`.

## 6. Run locally

```bash
npm install
npm run dev
```

Visit <http://localhost:5173>.

## 7. Deploy to Vercel

1. Push the repo to GitHub.
2. In Vercel, import the repo. Framework preset: **Vite**.
3. Add the two `VITE_*` env vars (Production + Preview).
4. Deploy. `vercel.json` already rewrites all paths to `/index.html` for
   the SPA router.

---

## How the app works

### Authentication

Teachers log in with **Emp No + password**. Under the hood the app constructs
`{empNo}@duty.internal` and uses Supabase email/password auth — teachers never
see the constructed email.

- Default password: `Wso2026!`
- On first login (or after an admin reset), `staff.must_change_password = true`
  and the user is gated behind `/change-password` until they pick a new one.
- Self-service reset is disabled; only an admin can reset, which sets the
  password back to the default and flips the flag back on.

### Roles

A single `profiles` table holds `(id, staff_id, is_admin)`:

- Teacher profile: `is_admin=false`, `staff_id` points at the `staff` row.
- Admin profile: `is_admin=true`, `staff_id` is null (admin-only) or set
  (admin who is also a teacher).

### Quotas, capacity, and the booking window

All booking writes go through the `book_slot(p_slot_id)` RPC, which:

1. Checks `app_settings.booking_window_open`
2. Locks the slot row and refuses if `count(bookings) >= capacity`
3. Refuses if the caller has already booked their `effective_quota`
   (per-person override on `staff`, else inherited from `departments`)

`cancel_booking(p_booking_id)` checks ownership and the booking window.

Admins bypass these by writing directly to `bookings` via the Bookings page —
that's the "manual override" requirement.

### Slot privacy

`duty_slots` has no SELECT policy for teachers. The teacher slot browser calls
`get_browsable_slots()`, which projects only `(id, duty_type, day_of_week,
capacity, spots_taken, already_booked)` — **zone and location are never
returned to teachers**.

The monitor view calls `todays_duties()` which does include location, because
monitors need it to walk the building.

### Attendance

Writes go through `mark_attendance(p_booking_id, p_by_monitor)`:

- `p_by_monitor=false` requires the caller to own the booking (self-report)
- `p_by_monitor=true` allows any authenticated staff member (monitor mode)

The record stores `marked_by_staff_id` and `marked_by_monitor`, so the admin
report can show who confirmed each attendance and from which path.

Monitor mode subscribes to Postgres changes on `attendance_records` so ticks
appear on every connected device in real time.

---

## File map

```
src/
  lib/
    supabase.ts          Supabase client + emp_no → email helper
    auth.ts              signIn/signOut/changePassword
    edgeFunctions.ts     typed wrappers for the two admin Edge Functions
    database.types.ts    DB types (regenerate with `supabase gen types ...`)
  hooks/useAuth.tsx      Session + profile + staff context
  components/
    AppLayout.tsx        Top nav, signed-in shell
    ProtectedRoute.tsx   Redirects to /login, /change-password, or /
    ui.tsx               Button/Input/Card/Badge primitives
  pages/
    Login.tsx, ChangePassword.tsx, Home.tsx
    admin/   Overview, Staff, Departments, Slots, Bookings, Attendance
    teacher/ Dashboard, Slots
    attendance/ SelfReport, Monitor
  App.tsx                Routes
  main.tsx               BrowserRouter + StrictMode

supabase/
  migrations/            SQL: schema, RLS, RPCs, realtime publication
  functions/             Edge Functions (Deno)

scripts/
  bootstrap-admin.ts     Create the first admin
  seed-staff.ts          Bulk import staff + create auth accounts
  sample-staff.csv       Example CSV
```
