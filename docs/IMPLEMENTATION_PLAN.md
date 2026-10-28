# MallSentinel — Implementation Plan

Source of truth: `resources/SRS documentation/MallSentinel_SRS.pdf` (UC-01..UC-16, class diagram 4.8, ERD 4.10).
Work one phase at a time. Tick a box only when the code exists **and** its tests pass.

Legend: `[x]` done · `[ ]` to do · `[~]` partially done / deferred

---

## Phase 0 — Foundation

Goal: two independent apps (`backend/`, `frontend/`) plus a root `docker-compose.yml` that starts the dev stack.

- [x] Root `docker-compose.yml`: `db` (pgvector/pgvector:pg16, named volume, healthcheck), `backend`, `adminer` (Mailpit was removed; email uses Gmail SMTP)
- [x] Root `.gitignore`, `README.md` with run steps
- [x] `backend/`: Dockerfile (Python 3.11), `requirements.txt`, `requirements-dev.txt`, `.env.example`
- [x] Backend skeleton: `app/core` (settings, security, errors, deps), `app/db` (async engine/session), routers → services → models
- [x] Consistent error JSON `{"detail": "...", "code": "SOME_CODE"}` for HTTP, validation and unhandled errors
- [x] Alembic configured for async SQLAlchemy; first migration creates the `vector` extension (ready for later phases)
- [x] `GET /api/v1/health` (DB ping)
- [x] pytest setup against a dedicated test database (`mallsentinel_test`), run inside the backend container
- [x] `frontend/`: Vite + React 18 + TypeScript strict + Tailwind + shadcn/ui primitives, `.env.example` (`VITE_API_URL`), Dockerfile
- [x] Brand tokens from the logo, light/dark theme via CSS variables, Sora (headings) + Inter (body)
- [x] Logo copied to `frontend/public/` and used as favicon
- [x] Typed API client `src/lib/api.ts`, TanStack Query client, React Router

## Phase 1 — Authentication + RBAC (UC-01, UC-02 user part, UC-04)

### Database (migration `0001_initial_auth`)

| Table | Key columns |
|---|---|
| `departments` | `id`, `code` (`bakery`/`meat_shop`/`security`, unique), `name`, `description`, `created_at` |
| `users` | `id` (UUID), `email` (unique, lower-cased), `full_name`, `phone`, `role` (enum `admin`/`supervisor`/`employee`), `status` (enum `active`/`disabled`/`removed`), `password_hash` (**nullable**), `auth_provider` (enum `password`/`google`), `google_sub` (**nullable, unique**), `failed_login_attempts`, `locked_until`, `last_login_at`, `password_changed_at`, `created_by_id`, timestamps |
| `admin_profiles` | `user_id` (PK/FK), `access_level` |
| `supervisor_profiles` | `user_id` (PK/FK), `department_id` (FK), `designation` |
| `employee_profiles` | `user_id` (PK/FK), `department_id` (FK), `supervisor_id` (FK users, nullable), `designation`, `shift`, `assigned_area`, `employee_code` (unique, nullable) |
| `refresh_tokens` | `id`, `user_id`, `token_hash` (unique), `expires_at`, `revoked_at`, `replaced_by_id`, `user_agent`, `ip`, `created_at` |
| `password_reset_tokens` | `id`, `user_id`, `token_hash` (unique), `expires_at`, `used_at`, `created_at` |
| `audit_log` | `id` (bigserial), `occurred_at`, `actor_user_id`, `actor_email`, `action`, `entity_type`, `entity_id`, `details` (JSONB), `ip`, `prev_hash`, `hash` |

`audit_log` is a tamper-evident ledger: `hash = sha256(prev_hash + canonical JSON of the row)`. Appends are serialised with a transaction-level advisory lock. A trigger raises an exception on any `UPDATE`/`DELETE` (and `TRUNCATE`).

### Backend
- [x] Models + migration for the tables above
- [x] Password hashing with argon2 (`argon2-cffi`)
- [x] JWT access token (short-lived, returned in the body) + opaque refresh token in an httpOnly cookie (rotated on every refresh, reuse → whole family revoked)
- [x] `POST /api/v1/auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`
- [x] Lockout: `LOGIN_MAX_ATTEMPTS` (5) failures → locked for `LOGIN_LOCKOUT_MINUTES` (15)
- [x] Distinct error codes: `INVALID_CREDENTIALS`, `ACCOUNT_LOCKED`, `ACCOUNT_DISABLED` (SSD UC-01)
- [x] `POST /auth/forgot-password` (always 202, no account enumeration) + `POST /auth/reset-password` (single-use, expiring, hashed token; revokes all sessions)
- [x] Email via Gmail SMTP (App Password); a clear "not configured" state when credentials are missing
- [x] `require_role(...)` dependency on every protected endpoint (403 `FORBIDDEN` for wrong role)
- [x] Admin (supervisors only): `GET/POST /supervisors`, `GET/PATCH /supervisors/{id}`, `POST /supervisors/{id}/disable|enable|unlock`
- [x] Supervisor: `GET/POST /employees`, `GET/PATCH/DELETE /employees/{id}` (own department only, soft delete → `status=removed`)
- [x] `GET /departments`
- [x] Audit rows for: login success/failure/locked, logout, password reset request/complete, user created/updated, role change, disable/enable, employee removed
- [x] Seed (`python -m app.seed`, idempotent): admin from `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`, 3 departments, 1 supervisor + 2 employees per department with `SEED_DEMO_PASSWORD`; prints demo logins
- [x] Google sign-in prepared (nullable `password_hash`, `auth_provider`, `google_sub`) — **not implemented**
- [x] pytest: auth, users, employees, departments, audit ledger (happy path, 403, 422, lockout, reset expiry/reuse) — 78 tests passing in the backend container (Python 3.11)

### Frontend
- [x] Sign In (split layout, logo + tagline, single form for all roles, disabled "Continue with Google — coming soon")
- [x] Redirect by role to `/admin`, `/supervisor`, `/employee`
- [x] Forgot Password, Reset Password, 403, 404 pages
- [x] Auth context with silent refresh on load and on 401
- [x] Route guards (`RequireAuth`, `RequireRole`) + role-based sidebar navigation
- [x] App shell: collapsible navy sidebar (drawer on mobile), top bar with user menu, logout, light/dark toggle
- [x] Admin → Supervisors page: search, section/status filters, pagination, create/edit dialog, disable/enable/unlock; cards on mobile
- [x] Supervisor → Employees page: CRUD scoped to their department
- [x] Employee → My Profile (read-only placeholder)
- [x] Dashboard placeholders for each role
- [x] Loading / empty / error states; forms with react-hook-form + zod
- [~] Responsive check at 360 / 768 / 1280 / 1536 px — layouts are mobile-first (drawer sidebar, cards below `md`, bottom-sheet dialogs) and the app type-checks, builds and serves, but **no one has looked at it in a browser yet**: needs a manual pass at the four widths, in light and dark mode
- [~] Verified by hand against the running stack: login per role, 403s, supervisor department scoping, refresh cookie, lockout message, reset email flow, audit chain intact. UI flows (forms, dialogs, tables) not yet exercised in a browser

### Added after first review
- [x] Independent sessions per browser tab (`X-Tab-Id` header, per-tab refresh cookie name, session hint in `sessionStorage`); tested in the API (2 tests) and in a real browser with two tabs
- [x] `python -m app.seed --sync-admin` applies a changed `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` to the existing admin (audited)
- [x] Public marketing site at `/` (navbar with Sign In, hero, features, how it works, sections, stats, about, FAQ, contact, footer); dashboards code-split; design notes in `docs/DESIGN_DIRECTION.md`
- [x] Browser-checked (headless Edge): landing at 1280 / 768 / 360 px, light and dark, no horizontal overflow, no console errors
- [x] Public site v2 (rebuilt after review): 3D hero scene (react-three-fiber, lazy, SVG fallback), floating feature rows, simulated CCTV demo, scroll-drawn timeline, tilting section cards, count-up stats, spotlight/tilt cards, border-beam button, scroll progress; About section removed; light and dark themes via `--ln-*` tokens
- [x] Browser-verified (headless Edge, software WebGL): hero scene renders and resumes after scrolling away, demo autoplay / click / pause, mobile drawer, light and dark, 360 and 1440 px, no console errors
- [x] Public site v3: brand-blue highlighted heading words, "impact" cards on How it Works (slam in, shockwave ring, glow from all sides, replays on re-entry), reveal variants (left / right / zoom / blur), scroll parallax glows, mixed-colour light theme with amber / maroon / teal / steel glows, static glows on Sign In and the app shell
- [x] Public site v4: interactive background web (canvas network: nodes spring around their home, the cursor pushes them away and lights lines to nearby nodes; pauses off-screen; static under reduced motion), navbar links centred (inline from 1024 px), transparent logo mark with no white box, responsive pass at 360 / 768 / 1024 / 1536 px (tablet demo wall, wider headings)
- [x] Mobile hero fixed: grid column pinned with `minmax(0,1fr)`, the 3D scene is taken out of layout (absolute) and zooms out on narrow screens so the whole orbit stays in frame
- [x] Browser history: `/login`, `/forgot-password` and `/reset-password` no longer redirect signed-in users forward (that made Back bounce). Signing in is a normal history step, so Back returns to `/login`, which shows "You're already signed in" with Go to dashboard / Sign in as someone else. After sign-out, Back cannot reopen a dashboard
- [x] Dashboards rebuilt (admin, supervisor, employee): banner with the interactive web, count-up stat cards that deep-link (`/admin/supervisors?status=...&new=1`), hoverable donut (people by section), activity tabs, live API status chip, shift-coverage bars, personal pre-shift self-check (kept on the device), "coming next" cards labelled with their phase. Only real data is shown; no invented metrics
- [x] Stale history entries: Back/Forward onto a page the current role cannot open (an old /admin after signing in as an employee) is skipped instead of showing 403; a deliberate visit to a wrong-role URL still shows 403. Pages restored from the browser back/forward cache are reloaded so they never show the previous user's session (`lib/navDirection.ts`, `routes/NavTracker.tsx`)
- [~] Still to review by a person: real-GPU smoothness of the 3D hero and the web, the mobile drawer, hover effects, and the app screens (Users / Employees tables and dialogs)

### Role split and penalties (decided after the first review)
- [x] **Admin = supervisors only** (and later CCTV). `/users` became `/supervisors`; admins get 404 for employee records and 403 on `/employees` and `/penalties`
- [x] **Supervisor manages employees** in their own department: create, edit, disable, **unlock**, remove (soft delete)
- [x] **Penalties** (`penalties` table, migration 0002): supervisor reviews an employee's earlier penalties, then issues a penalty (reason valid for the section, severity Low/Medium/High/Critical, action: verbal or written warning, fine in PKR, suspension in days, other, optional notes). Saved and audited (`penalty.issued`) **before** any email is attempted; there is no delete endpoint
- [x] **Penalty email** to the employee's account address via Gmail SMTP; outcome stored (`sent` / `failed` / `not_configured`), a **Resend** button and a `penalty.email_resent` audit row; delivery errors are never returned by the API
- [x] **Employee** sees only their own penalties (`GET /penalties/mine`), on a My Penalties page and on their dashboard
- [x] Mailpit removed from the stack, docs and settings
- [x] pytest: 103 tests (supervisors, employees incl. unlock and admin exclusion, penalties incl. email failure, resend, validation, role permissions and isolation)
- [~] **Needs you:** put the sending Gmail address and its App Password in `backend/.env` (`SMTP_USER`, `SMTP_PASSWORD`); until then penalties show "Email not set up"
- Note: this brings the manual part of Phase 7 forward. Linking penalties to detected violations, SOP clauses and evidence stays in Phase 7.

### Out of scope for Phase 1
- Google OAuth (only the schema + disabled button)
- Any AI / RAG / chatbot / CV work

---

## Phase 2 — Cameras & departments config (UC-02, UC-13) — not started
- [ ] `cameras` table (ERD: camera_name, ip_address/rtsp_url, location, monitored_area, status, installed_date, department_id)
- [ ] Admin camera CRUD + connection test; audit on config changes
- [ ] Duty zones (polygons) per camera for Security
- [ ] `mediamtx` service with MP4 → RTSP simulated cameras

## Phase 3 — SOP management (UC-03, UC-10) — not started
- [ ] `sop_clauses` (clause_code, title, description, severity, department_id, version)
- [ ] Admin CRUD with versioning + audit; supervisor/employee read-only views

## Phase 4 — CV service (UC-13, UC-14) — not started
- [ ] `cv-service` (OpenCV RTSP, YOLO + ByteTrack), PPE / uniform / weapon / zone checks
- [ ] `/internal/*` ingestion endpoints guarded by `INTERNAL_SERVICE_TOKEN`
- [ ] `violations`, `evidence` (snapshot/clip only, served via authenticated endpoint)

## Phase 5 — Alerts & real-time (UC-15, UC-11) — not started
- [ ] `alerts` table, WebSocket channel, live dashboard widgets

## Phase 6 — AI agent / RAG (UC-14 enrichment) — not started
- [ ] pgvector embeddings of SOP clauses (all-MiniLM-L6-v2, 384-dim)
- [ ] Provider-agnostic LLM client, severity classification, `incident_reports` draft, suggested penalty

## Phase 7 — Review, penalties, records (UC-07, UC-08, UC-09, UC-05, UC-12, UC-16) — not started
- [ ] Evidence review, `penalties` approve/modify/waive, every decision through the audit service
- [ ] Employee history with strict data isolation; exports (PDF/CSV)

## Phase 8 — Chatbot (UC-06) — not started

## Phase 9 — Hardening & deployment — not started
