# SpendWise — Expense Tracker — Full Project Context (V4)

> Product brand: **SpendWise** (shown in the UI sidebar/title).
> Repo/project name: `Expense-Tracker`. Backend API title is still `Expense Tracker API`.
> **V4:** live on Render + Neon + Vercel; password policy hardened; analytics-trend & edit-transaction bugs fixed; **Tracker (subscriptions) feature built**. Now developing on a `develop` branch (see `GITHUB_GUIDE.md`).

---

## System Info
- **OS**: Windows (Git Bash / MINGW64)
- **Project Root**: `D:\Projects\Expense-Tracker`
- **Shell**: `source .venv/Scripts/activate` (not `/bin/activate`)
- **Python**: 3.10 | **Node**: 22.x

> ⚠️ See `frontend/AGENTS.md`: this Next.js version has breaking changes vs. training data. Read `node_modules/next/dist/docs/` before writing Next.js-API-level code (routing, server actions, config). Plain React/JSX/Tailwind component edits are unaffected.

---

## Stack
| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui |
| State | TanStack Query v5, TanStack Table v8 |
| Forms | react-hook-form + Zod |
| Charts | Recharts |
| Toasts | **sonner** (`<Toaster richColors closeButton position="bottom-right" />`) |
| Auth (FE) | NextAuth.js v5 beta (`next-auth@5.0.0-beta.31`) |
| Backend | FastAPI, Python 3.10 |
| ORM | SQLAlchemy 2.0 async (asyncpg) |
| Migrations | Alembic |
| Auth (BE) | python-jose, passlib[bcrypt] |
| Rate limiting | **slowapi** |
| Email | SMTP (`app/core/email.py`) for password-reset codes |
| Database | PostgreSQL 16 (Docker local, Neon.tech prod) |
| HTTP Client | Axios |
| Icons | Lucide React |
| Font | **Plus Jakarta Sans** (via `next/font/google`, weights 300–800) |

---

## Feature Inventory (current)

### Core personal finance
- **Dashboard** — summary cards, dynamic `FinancialInsight` banner, 12-month trend chart (Bar/Line toggle), budget overview, recent transactions, **upcoming-renewals widget** (next subscriptions due within 30 days).
- **Transactions** — TanStack Table with filters bar, add/edit modal, soft delete, row selection / bulk actions, **CSV export**, recurring flag. Type chosen via a prominent **segmented Expense/Income toggle** at the top of the modal.
- **Budgets** — per-category budgets with reset-day cycle, MiniDonut visualization, ≥75% amber warning, over-budget sticky alert banner, "days left in cycle".
- **Analytics** — spending-trend area chart (3/6/12/24-month selector), by-category donut with month selector, stat cards (avg/day, biggest expense, top category, savings rate).

### Tracker (subscriptions)
- **Tracker page** (`/tracker`) — recurring subscriptions (Netflix, Spotify, gym…). Informational only (no transactions created); INR-only spend totals in Phase 1.
- Summary cards (monthly spend · yearly spend · active count · next renewal), status filter (Active/Paused/Cancelled/All) + sort (renewal/amount/name), card grid with deterministic icon/color (`lib/group-utils.ts`), urgency-colored countdown, kebab (Edit · Pause/Resume · Cancel · Delete).
- **Renewal computed on read** (`_enrich` in `subscriptions.py`) by advancing `anchor_date` by the billing cycle until ≥ today (month-end clamped) — self-correcting, no background job. `urgency` values are `"ok" | "soon" | "muted"` (NOT green/amber/grey).
- Reminders are **in-app only** in Phase 1 (countdown colors + dashboard widget; no nav badge yet). Email reminders are Phase 2 — see `TRACKER_PLAN.md`.

### Groups (split expenses — Splitwise-style)
- **Group list** (`/groups`) and **group detail** (`/groups/[id]`).
- Members, group expenses (equal split with exact paise distribution), settlements.
- **Balances + debt simplification**: greedy min-cash-flow algorithm (`_simplify_debts`, heap-based) produces the minimum set of "who pays whom" suggestions.
- Members are locked once a group has expenses.
- Decorative deterministic icon/color per group/member (`lib/group-utils.ts`, not persisted).

### Auth & account
- Email/password register + login, JWT access (15m) + refresh (7d).
- **Password policy** — passwords that are *set* (register / change / reset) require **8+ chars, ≥1 uppercase, ≥1 symbol**. Enforced backend (`StrongPassword` annotated type in `schemas.py`) and frontend (`strongPasswordSchema` in `lib/validations.ts`). Login is intentionally length-only (verifies an existing hash; stricter rules would lock out older accounts).
- **Google OAuth** (`/auth/google` verifies Google `id_token`; `google-button.tsx` on FE).
- **Forgot password** — emailed 6-digit code (`forgot-password` → `reset-password` / `code-login`), codes hashed, 10-min expiry, single active code per user, generic response (no email enumeration).
- **Change password** (`/auth/change-password`) for the Security settings page.
- **Profile** update (`PATCH /auth/me`) and account delete (`DELETE /auth/me`).
- **Settings** pages: Profile, Security, Preferences.

### Cross-cutting
- **Toast notifications** (sonner) on all mutations and confirm flows.
- **Global search** (`global-search.tsx`) in the header — groups by name, transactions by category.
- **Rate limiting** via slowapi.
- Single logout entry point: bottom-left sidebar profile menu (the top-right header dropdown intentionally has no logout).

---

## Monorepo Layout
```
D:\Projects\Expense-Tracker
├── backend
│   ├── .venv
│   ├── alembic/versions/
│   │   ├── 51219306a231_initial_schema.py
│   │   ├── 109f713a4cf3_add_password_reset_codes.py
│   │   ├── edb724ca0243_add_group_splitting_tables.py
│   │   └── b7f2a4c9d1e3_add_subscriptions_table.py
│   ├── app
│   │   ├── api
│   │   │   ├── deps.py
│   │   │   └── v1/
│   │   │       ├── auth.py         (register, login, refresh, google,
│   │   │       │                    change-password, forgot/reset/code-login, me CRUD)
│   │   │       ├── transactions.py
│   │   │       ├── categories.py
│   │   │       ├── budgets.py
│   │   │       ├── analytics.py
│   │   │       ├── groups.py        (groups, members, expenses, settlements, balances)
│   │   │       └── subscriptions.py (list, summary, upcoming, CRUD; _enrich renewal calc)
│   │   ├── core/ config.py, database.py, security.py, email.py
│   │   ├── models/models.py
│   │   ├── schemas/schemas.py
│   │   └── main.py                  (slowapi limiter + CORS, routers)
│   ├── .env
│   ├── requirements.txt
│   └── seed.py
├── frontend
│   ├── app
│   │   ├── (dashboard)
│   │   │   ├── layout.tsx
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── transactions/page.tsx
│   │   │   ├── budgets/page.tsx
│   │   │   ├── tracker/page.tsx
│   │   │   ├── groups/page.tsx
│   │   │   ├── groups/[id]/page.tsx
│   │   │   ├── analytics/page.tsx
│   │   │   └── settings/
│   │   │       ├── page.tsx
│   │   │       ├── profile/page.tsx
│   │   │       ├── security/page.tsx
│   │   │       └── preferences/page.tsx
│   │   ├── api/auth/[...nextauth]/route.ts
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   ├── forgot-password/page.tsx
│   │   ├── page.tsx                 (redirects to /dashboard or /login)
│   │   ├── globals.css
│   │   └── layout.tsx               (Plus Jakarta Sans, <Toaster />, title "SpendWise")
│   ├── components
│   │   ├── auth/ auth-card.tsx, google-button.tsx
│   │   ├── budgets/budget-modal.tsx
│   │   ├── dashboard/ financial-insight, summary-cards, trend-chart,
│   │   │              budget-overview, recent-transactions, upcoming-renewals
│   │   ├── transactions/ columns, data-table, filters-bar, transaction-modal
│   │   │              (NOTE: folder renamed from ledger/ → transactions/)
│   │   ├── subscriptions/ subscription-modal, subscription-card
│   │   ├── groups/ group-modal, expense-modal, settle-modal
│   │   ├── layout/ sidebar, header, mobile-nav, global-search
│   │   ├── providers/providers.tsx (SessionProvider + QueryClientProvider)
│   │   └── ui/                       (~18 shadcn components)
│   ├── hooks/ use-transactions, use-categories, use-budgets,
│   │          use-analytics, use-groups, use-profile, use-subscriptions
│   ├── lib/
│   │   ├── api.ts, auth.ts, utils.ts, validations.ts
│   │   ├── nav.ts                    (navSections — single source for sidebar + mobile-nav)
│   │   ├── group-utils.ts            (initials, colorFor, iconFor, GROUP_ICONS)
│   │   └── validations/ transaction.ts, budget.ts, subscription.ts
│   ├── types/index.ts
│   ├── middleware.ts
│   └── .env.local
└── docker-compose.yml
```

---

## Database Models (`backend/app/models/models.py`)
- **User** — email/name/hashed_password/google_id/avatar_url; relations to transactions, categories, budgets, groups.
- **Category** — system (user_id NULL) or per-user; icon + color.
- **Transaction** — type enum, `Numeric(12,2)`, currency (default INR), recurring, **soft delete via `deleted_at`**.
- **Budget** — per category, `limit_amount`, `reset_day`, `is_active`.
- **PasswordResetCode** — hashed code, `expires_at`, `used_at`.
- **Group** → **GroupMember** (is_owner), **GroupExpense** → **ExpenseSplit**, **Settlement** (from/to member). All FK-cascade off Group.
- **Subscription** — `BillingCycle` (weekly/monthly/quarterly/yearly) + `SubscriptionStatus` (active/paused/cancelled) enums, `amount` `Numeric(12,2)`, `anchor_date` (renewal computed on read, no stored next-date), optional `category_id` (SET NULL, reserved for future finance link), `reminder_days_before`, **soft delete via `deleted_at`**.

---

## Key Conventions (Never Break)

1. **Async everywhere** in backend
2. **Soft delete** — transactions use `deleted_at`, every query filters `.is_(None)` (groups/members/expenses are hard-deleted via cascade)
3. **Amounts** — `Numeric(12,2)` in DB, string in JSON, `parseFloat()` on frontend
4. **Protected routes** — every endpoint except `/auth/*` and `/health` needs `get_current_user`; group rows are always scoped `Group.user_id == current_user.id`
5. **Never edit existing migrations** — always `alembic revision --autogenerate`
6. **CORS** — never `"*"`, use `FRONTEND_URL` env var
7. **Always activate venv** before backend work
8. **TanStack Query** — mutations invalidate the relevant keys (`["transactions"]`, `["budgets"]`, `["analytics"]`, `["groups"]`, `["group", id]`, `["group-balances", id]`, `["subscriptions"]` — note the subscriptions summary/upcoming/list all live under the `["subscriptions", …]` prefix, so invalidating `["subscriptions"]` covers them all)
9. **Currency** — `₹` prefix with `toLocaleString("en-IN", { minimumFractionDigits: 2 })`
10. **Zod + react-hook-form** — use `z.input<typeof schema>` for FormValues when using `z.coerce`
11. **Budget limit_amount** — always string (matches `BudgetPayload`)
12. **useTransactionSummary** — two string args: `(date_from?, date_to?)` not an object
13. **getDaysLeftInCycle(resetDay)** — keep budgets/page.tsx and budget-overview.tsx in sync
14. **Toasts** — surface success/error via sonner in mutation hooks; modals stay open on error (the hook already toasts)
15. **Group splits** — split in integer paise then distribute remainder so shares sum exactly to the total (`_equal_split`)
16. **Nav** — edit `lib/nav.ts` only; sidebar + mobile-nav both consume `navSections`
17. **Password strength** — reuse `StrongPassword` (BE) / `strongPasswordSchema` (FE) for any password-*set* path; never reintroduce length-only `min(8)`. Do not apply strength rules to login.
18. **Pydantic field/type name clash** — never annotate a field with an imported type of the same name *and a default* (e.g. `date: Optional[date] = None`); the default shadows the type and the field silently becomes "must be None". `schemas.py` imports the date type as `date_type` — use it. (Caused the edit-transaction 422; see `FIXES.md` #0c.)
19. **API error messages (FE)** — `getErrorMessage` must always return a string; FastAPI 422 `detail` is an array of objects, so never pass it raw to `toast()`/JSX (it crashes the render).

---

## Project Docs (repo root, git-ignored — local reference)
- `FIXES.md` — production-readiness issues + log of fixed bugs (analytics trend, edit-txn 422, password policy).
- `DEPLOYMENT.md` — full Render + Neon + Vercel deployment runbook.
- `TEST_PLAN.md` — phased plan for the (not-yet-built) test suite.
- `TRACKER_PLAN.md` — spec for the Tracker (subscriptions) feature (Phase 1 built; Phase 2 backlog).
- `GITHUB_GUIDE.md` — branching workflow (`main` ← `develop` ← `feature/*`).

---

## Auth / Forgot-password flow (backend `auth.py`)
- `POST /auth/forgot-password` → if user exists, invalidates prior unused codes, generates a 6-digit code, hashes it, 10-min expiry, emails it via background task. Always returns a generic message.
- `POST /auth/reset-password` `{email, code, new_password}` and `POST /auth/code-login` `{email, code}` both go through `_consume_code` (validates newest unused, unexpired, hash-matched code, then marks `used_at`).
- `POST /auth/change-password` requires current password; rejects Google-only accounts (no `hashed_password`).

---

## Groups API surface (`/api/v1/groups`)
- `GET ""` list · `POST ""` create · `GET /{id}` detail · `PATCH /{id}` rename · `DELETE /{id}`
- `POST /{id}/members` · `DELETE /{id}/members/{member_id}` (blocked once expenses exist / last member)
- `POST /{id}/expenses` · `PATCH /{id}/expenses/{expense_id}` (re-splits on amount change) · `DELETE …`
- `POST /{id}/settlements` · `DELETE /{id}/settlements/{settlement_id}`
- `GET /{id}/balances` → `{ balances[], suggestions[] }` (net = paid − owed + settlement adjustment; suggestions from greedy debt simplification)

---

## Subscriptions API surface (`/api/v1/subscriptions`)
All protected, user-scoped, `deleted_at.is_(None)`. Every read goes through `_enrich` (renewal/cost/urgency computed server-side).
- `GET ""` list (enriched, sorted by `days_until_renewal` asc; optional `?status=`) · `POST ""` create · `GET /{id}` · `PATCH /{id}` · `DELETE /{id}` (soft delete)
- `GET /summary` → `{ monthly_total, yearly_total, active_count, due_soon_count, next_name, next_days }` (active subs only)
- `GET /upcoming?days=30` → active subs renewing within N days (drives the dashboard widget)
- Pause/Resume/Cancel are just `PATCH /{id}` with a `status` change (no dedicated endpoint).
- `monthly_cost` normalization: monthly ×1 · yearly ÷12 · quarterly ÷3 · weekly ×52÷12.

---

## Types Reference (`frontend/types/index.ts`)
Core: `User`, `Category`, `Transaction`/`TransactionPayload`, `Budget`/`BudgetPayload`,
`MonthlyTrend`, `CategoryBreakdown`, `TransactionSummary`, `PaginatedTransactions`.
Groups: `GroupSummary`, `GroupMember`, `ExpenseSplit`, `GroupExpense`, `Settlement`,
`GroupDetail`, `MemberBalance` (`net` >0 owed / <0 owes), `SettlementSuggestion`,
`GroupBalances`, and `*Payload` create types.
Tracker: `BillingCycle`, `SubscriptionStatus`, `Subscription` (incl. enriched `next_renewal`,
`days_until_renewal`, `monthly_cost`, `urgency`), `SubscriptionPayload`, `SubscriptionSummary`.

Notes: `MonthlyTrend.income/expense` are numbers; `CategoryBreakdown` has no icon/color.

---

## Outstanding / Backlog

| Item | Status |
|---|---|
| Toast notifications (sonner) | ✅ Done |
| Rename Ledger → Transactions (folder + routes) | ✅ Done |
| Dashboard smart insights | ✅ Done |
| Budget cycle indicator + alert | ✅ Done |
| Analytics expansion (trend selector, stat cards, donut) | ✅ Done |
| Transactions CSV export + row selection | ✅ Done |
| Groups / split expenses + settle-up | ✅ Done |
| Auth: change-password, forgot/reset, Google OAuth | ✅ Done |
| Settings: profile / security / preferences | ✅ Done |
| Deployment (Render + Neon + Vercel) | ✅ Done — see `DEPLOYMENT.md` |
| Micro-animations + UI polish | ⬜ Ongoing |
| Mobile responsiveness audit | ⬜ Ongoing |
| Unequal / percentage group splits | ⬜ Not started (currently equal-split only) |
| **Tracker** (subscriptions) | ✅ Done (Phase 1) — page, summary/CRUD API, dashboard widget. Phase 2 (email reminders, nav badge, finance link, multi-currency) pending — see `TRACKER_PLAN.md` |
| Automated tests + CI | ⬜ Not started — plan in `TEST_PLAN.md` |

---

## Phase 3 — Deployment (✅ Done)
Live deployment (full runbook in `DEPLOYMENT.md`):
- Frontend → **Vercel** · Backend → **Render** (free tier, Docker) · DB → **Neon.tech** (serverless Postgres).
- **`DATABASE_URL` must be the asyncpg form** — `postgresql+asyncpg://…?ssl=require` (not Neon's raw `postgresql://…?sslmode=require`, which falls back to psycopg2 and crashes).
- The backend `Dockerfile` runs `alembic upgrade head && python seed.py && uvicorn …` at startup (both idempotent), so **no manual migrate/seed step** is needed — important because Render free tier has no pre-deploy/shell commands.
- Prod env: `FRONTEND_URL` (exact Vercel origin, no trailing slash, for CORS), `NEXTAUTH_URL`/`NEXTAUTH_SECRET`/`AUTH_SECRET`, SMTP creds, Google OAuth creds + redirect URI.
- Known limits (free tier): Render sleeps when idle (cold starts); single-origin CORS blocks Vercel preview deploys. See `FIXES.md`.

---

## How to Run (Local Dev)
```bash
# Terminal 1
docker compose up -d

# Terminal 2
cd backend && source .venv/Scripts/activate
uvicorn app.main:app --reload --port 8000

# Terminal 3
cd frontend && npm run dev
```

| URL | Purpose |
|---|---|
| http://localhost:8000/docs | Swagger UI |
| http://localhost:8080 | Adminer |
| http://localhost:3000 | Frontend |

---

## Environment Variables

### Backend (`backend/.env`)
```
DATABASE_URL=postgresql+asyncpg://postgres:PASSWORD@localhost:5432/expense_tracker
SECRET_KEY=long-random-string
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
FRONTEND_URL=http://localhost:3000
# SMTP (password-reset emails)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=            # defaults to SMTP_USER if blank
```

### Frontend (`frontend/.env.local`)
```
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=generate-with-openssl-rand-base64-32
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```
