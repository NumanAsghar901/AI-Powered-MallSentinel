# MallSentinel — Project Guide for Claude Code

Read this file fully at the start of every session. Then read `docs/IMPLEMENTATION_PLAN.md` and continue from the current phase.

## Current focus (update this section as the project moves on)

- **Now:** Phase 0 (foundation) and Phase 1 (authentication + RBAC). Frontend and backend only.
- **Not yet:** no AI agent, RAG, chatbot or computer-vision work until the team says so. Do not add LLM, embeddings or CV dependencies yet.
- `backend/` and `frontend/` are **separate, independent folders**, each with its own dependencies, Dockerfile and `.env.example`. The frontend must also run standalone with `npm run dev`.
- **Auth decisions:**
  - One generic **Sign In** page for all three roles (Admin, Supervisor, Employee). The backend identifies the role and the frontend redirects to `/admin`, `/supervisor` or `/employee`. No role selector, no public sign-up.
  - Admin creates supervisors and employees. Supervisors manage employees in their own department only.
  - The first admin account is seeded from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` in `backend/.env`. **Never hardcode credentials in code, tests, docs or commits.**
  - **Each browser tab keeps its own session.** The frontend sends a per-tab `X-Tab-Id` (kept in `sessionStorage`) and the API names the refresh cookie after it (`ms_refresh_<tab id>`), so an admin in one tab and an employee in another never swap accounts. The cookie stays httpOnly.
  - **Browser Back must behave.** Public auth pages (`/login`, `/forgot-password`, `/reset-password`) never auto-redirect signed-in users; `/login` shows an "already signed in" panel instead. Sign-in navigates with a normal history push.
  - **Public website at `/`.** `/` is the marketing site (navbar → Sign In → `/login`; after login the user goes to their role dashboard). The design rules for it are in `docs/DESIGN_DIRECTION.md`: glass cards, glows, grid/low-poly backdrop, the 3D hero scene, shimmer text, spotlight/tilt cards, marquees, emoji icon chips and scroll-reveal are allowed **on the marketing site only**. Sign In / Forgot / Reset pages and the app stay static and clean.
  - **Google sign-in comes later.** Prepare for it now: nullable `password_hash`, `auth_provider` (`password` / `google`) and nullable unique `google_sub` on `users`, plus a disabled "Continue with Google — coming soon" slot on the Sign In page. Do not implement Google OAuth yet.

## What we are building

MallSentinel is an AI-powered compliance monitoring web app for Pakistani malls and marts (FYP, FAST-NUCES Chiniot-Faisalabad, 2026. Team: Numan Asghar, Muhammad Sohaib, Fahad Javaid).

It analyses existing CCTV/IP camera feeds with computer vision to check SOP compliance in three sections:

- **Bakery** and **Meat shop**: workers must wear hairnet, gloves, mask and apron.
- **Security**: guards must wear proper uniform, carry their weapon and stay inside their assigned duty zone.

When a violation is detected, an **AI agent (RAG)** retrieves the matching SOP clause, classifies severity, drafts an incident brief and suggests a penalty. The supervisor and the employee are alerted in real time. The supervisor reviews the evidence and approves / modifies / waives the penalty. Every decision is written to a **tamper-evident audit ledger**.

Roles: **Admin**, **Supervisor**, **Employee**. External actors: **CCTV System**, **MallSentinel AI Engine**.

## Source of truth (read these, in this order)

| What | Path | Notes |
|---|---|---|
| SRS | `resources\SRS documentation\MallSentinel_SRS.pdf` | Requirements, 16 use cases (UC-01..UC-16), SSDs, class diagram (4.8), ERD (4.10). **If code and SRS disagree, the SRS wins — or ask.** |
| Logo | `resources\logo\MallSentinel Logo.png` | Use in navbar, login page, favicon, PDF exports. Theme colours come from it (below). |
| Reference project | `reference site\Fyp_Kitchen_Eye-main` | **Read-only.** A similar FYP (FastAPI + Firebase). Copy its folder structure, router split and CV-pipeline patterns. **Never copy Firebase/Firestore code** — this project uses PostgreSQL. Never modify files in this folder. |

Paths contain spaces — always quote them in shell commands.

## Tech stack (fixed — do not swap anything without asking)

| Layer | Choice |
|---|---|
| Database | PostgreSQL 16 + `pgvector` extension (image `pgvector/pgvector:pg16`), running in Docker Desktop |
| Backend | Python 3.11, FastAPI, SQLAlchemy 2.0 (async, `asyncpg`), Alembic, Pydantic v2, `pydantic-settings` |
| Auth | Own JWT auth (access token + refresh token in httpOnly cookie), argon2/bcrypt password hashing, RBAC. **No Firebase.** |
| Real-time | FastAPI WebSockets for alerts and live dashboard updates |
| CV service | Separate Python service: OpenCV (RTSP), Ultralytics YOLO + built-in ByteTrack tracking |
| AI agent | Provider-agnostic LLM client (`LLM_PROVIDER` = `gemini` / `openai` / `ollama`), local embeddings with `sentence-transformers` (`all-MiniLM-L6-v2`, 384-dim) stored in pgvector |
| Frontend | React 18 + Vite + TypeScript (strict), Tailwind CSS, shadcn/ui, TanStack Query, React Router, react-hook-form + zod, Recharts, lucide-react icons |
| Dev infra | Docker Compose: `db`, `backend`, `frontend`, `cv-service`, `mediamtx` (simulated RTSP cameras from MP4 files), `adminer` (DB UI), `mailpit` (dev email for password reset) |

Everything runs with `docker compose up -d`. No paid cloud services are required.


## Brand and design system

The UI must look like a **professional, modern enterprise security/compliance product** — clean, calm, data-dense where needed, and **fully responsive** (test at 360px, 768px, 1280px and 1536px widths).
purple/violet gradients,neon glows, glassmorphism blobs, emoji in UI for modern eye catching UI design

Colours are taken from the logo. Sample the exact hex values from `resources/logo/` and adjust these starting values if needed:

| Token | Approx. hex | Use |
|---|---|---|
| `brand-navy` | `#1B2A4A` | Primary: sidebar, headings, primary buttons, "Mall" wordmark |
| `brand-teal` | `#0F6B7E` | Accent: links, active nav, focus rings, charts, "Sentinel" wordmark |
| `section-meat` | `#8C2F35` | Meat shop section badge/chart colour (logo's maroon panel) |
| `section-bakery` | `#D4912F` | Bakery section badge/chart colour (logo's amber panel) |
| `section-security` | `#3D6E99` | Security section badge/chart colour (logo's steel-blue panel) |
| Neutrals | slate scale | Backgrounds `#F7F9FB`, borders, body text |

- Semantic colours (success / warning / danger / info) must be **distinct from the section colours** so a "meat shop" badge is never confused with an error.
- Severity scale: Low / Medium / High / Critical, each with a consistent colour and icon.
- Typography: a geometric sans for headings (e.g. **Sora** or **Montserrat**, matching the wide logo wordmark) and **Inter** for body/UI text.
- Support **light and dark mode** via CSS variables (shadcn theming). Navy sidebar in both.
- Use shadcn/ui primitives; build tables with sorting, filtering, pagination and empty / loading / error states everywhere (the SRS SSDs define these alt flows — e.g. "No records found", "Clean record").
- Mobile: sidebar collapses to a sheet/drawer, tables become cards, all actions reachable by touch.

## Coding rules

**General**
- Work **one phase at a time** from the plan. At the start of a phase, summarise what you will build and ask about anything unclear. At the end, run the tests, update the plan's checkboxes and stop for review.
- Never commit secrets. All config comes from environment variables; keep `.env.example` up to date.
- Prefer small, reviewable commits with clear messages (`feat(violations): ...`).

**Backend**
- Routers → services → models. No business logic in routers.
- Every schema change goes through an **Alembic migration**. Never edit the DB by hand.
- Use the `require_role(...)` dependency on every endpoint. Employees may only ever read **their own** records (UC-12 data isolation).
- Every penalty decision, evidence review, SOP change and configuration change must be written through the **audit service** (hash-chained ledger).
- Return consistent error JSON: `{"detail": "...", "code": "SOME_CODE"}`.
- Write pytest tests for each router (happy path + permission denied + validation error).
- `/internal/*` endpoints are for the CV service only and require the `INTERNAL_SERVICE_TOKEN` header — never expose them to the frontend.

**Privacy (SRS 3.3.5)**
- Never store continuous video. Store only violation snapshots / short clips plus metadata.
- Evidence files are served only through an authenticated endpoint, never as public static files.

**Frontend**
- TypeScript strict, no `any`. One typed API client in `src/lib/api.ts`.
- Server state via TanStack Query; forms via react-hook-form + zod.
- Role-based route guards; hide navigation items the role cannot use.
