<div align="center">

# Jharkhand Civic Connect

### Crowdsourced Civic Issue Reporting & Resolution System

**SIH 25031 · Government of Jharkhand · Clean & Green Technology**

`REPORT → DETECT DUPLICATE → PRIORITISE → ROUTE → RESOLVE → VERIFY → ANALYSE`

[![Node.js](https://img.shields.io/badge/Node.js-22.x-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-5.x-000000?logo=express&logoColor=white)](https://expressjs.com)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-7.x-646CFF?logo=vite&logoColor=white)](https://vite.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.x-38B2AC?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Mongoose](https://img.shields.io/badge/Mongoose-8.x-880000?logo=mongodb&logoColor=white)](https://mongoosejs.com)
[![Tests](https://img.shields.io/badge/tests-node--test-2C9F4C)](server/flow.test.js)

[Quick Start](#quick-start) · [Demo Script](#demo-script) · [API Reference](#api-reference) · [Verification](#verification) · [Configuration](#configuration)

</div>

---

## Overview

Citizens report civic problems (garbage, potholes, waterlogging …) with a photo and a GPS pin;
the platform detects duplicate reports nearby, ranks everything with an **explainable priority
score**, routes each complaint to the right department, tracks it against an **SLA clock**, and
only closes it after the **citizen confirms the fix** — with evidence.

Every stakeholder has a first-class role:

| Role | What they do |
|---|---|
| **Citizen** | Report issues, support duplicates, verify or reject resolutions, track the timeline |
| **Official** | Triage a priority-sorted queue, verify, assign departments & field workers, watch SLAs |
| **Field worker** | Accept assigned work, update status, upload resolution photos as proof |

A **public Transparency page** publishes live city-wide statistics — resolution rate, ward and
department performance, hotspots — with zero personal data.

**Zero setup to run:** no MongoDB install, no Cloudinary account, no `.env` file. The API boots
an in-process MongoDB, seeds demo data, and stores photos on local disk.

---

## Key Features

- **📸 Evidence-based reporting** — photo (JPEG/PNG/WebP/HEIC, ≤ 5 MB), GPS pin, severity, ward, and a human-readable `CIV-…` complaint ID.
- **🧲 Duplicate detection** — `$geoNear` on a `2dsphere` index finds matching reports within a configurable radius (default **50 m**) *before* you submit; you support an existing report or declare it distinct.
- **🤝 Crowdsourced consolidation** — one citizen supports another's report; support count feeds directly into priority.
- **🧭 Explainable prioritisation** — a 0–100 score returned **with its component breakdown**, so officials can always answer *"why is this High?"*.
- **🔀 Automatic routing** — 11 issue categories map to 7 departments (see [`server/config.js`](server/config.js)); officials can override.
- **⏱ SLA accountability** — per-category deadlines start at verification; a cron tick every minute flags breaches and notifies the responsible department.
- **✅ Citizen-verified closure** — workers upload a resolution photo → citizen **confirms** (closes) or **rejects** (reopens with a fresh SLA clock).
- **📊 Dashboard & analytics** — queues, hotspots (grid aggregation), per-ward/department resolution rates, average resolution time.
- **🔔 In-app notifications** — role-aware, polled every 30 s, with unread counts.
- **🛡 Security** — JWT auth, bcrypt hashing, role guards on every transition, rate-limited login and report creation, strict upload filtering.

---

## Architecture

```
┌────────────────────────────── Browser (Vite :5173) ──────────────────────────────┐
│  React 19 · React Router 7 · Tailwind 4 · Leaflet · Recharts · Axios             │
│  /public /login /report /my /dashboard /work        (role-guarded routes)        │
└────────────────────────────────────┬─────────────────────────────────────────────┘
                          /api + /uploads (dev proxy)
                                     ▼
┌────────────────────────────── API (Express :4000) ───────────────────────────────┐
│  auth.js      register · login · me · JWT · requireAuth/requireRole              │
│  reports.js   create · nearby · support · status moves · assign · resolve ·      │
│               verify · reopen · photo uploads                                    │
│  admin.js     dashboard · analytics · hotspots · SLA breaches · public stats     │
│  index.js     app wiring + node-cron tick (SLA breach flag + priority ageing)    │
│  config.js    categories → department, weights, SLA hours, transitions, scoring  │
└────────────────────────────────────┬─────────────────────────────────────────────┘
                                     ▼
         Mongoose ── MONGO_URI (Atlas/local) or in-process mongodb-memory-server
         Photos  ── CLOUDINARY_URL or local server/uploads/
```

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22 (ES modules) |
| API | Express 5, JWT (`jsonwebtoken`), `bcryptjs`, `express-rate-limit`, `multer`, `node-cron` |
| Database | MongoDB via Mongoose 8 · `2dsphere` geospatial index · `mongodb-memory-server` fallback |
| Storage | Cloudinary (optional) or local disk (`server/uploads/`) |
| Frontend | React 19, Vite 7, Tailwind CSS 4, React Router 7, Axios |
| Maps & charts | Leaflet + React-Leaflet, Recharts |
| Testing | Node's built-in test runner (`node --test`) over live HTTP |

## Quick Start

**Requirements:** Node.js 18+ (developed on 22). Nothing else — no database, no API keys.

```bash
# 1. Install both workspaces (root orchestrates server/ and client/)
npm run setup

# 2. Terminal A — API on http://localhost:4000/api/v1
npm run dev

# 3. Terminal B — web app on http://localhost:5173
npm run dev:web
```

Open **http://localhost:5173**. On first boot the API detects an empty database, starts an
in-process MongoDB, and loads demo data automatically.

> **Real services:** set `MONGO_URI` and/or `CLOUDINARY_URL` (plus a strong `JWT_SECRET`) in
> `server/.env` — every variable is documented in [`server/.env.example`](server/.env.example).
> Without them the demo still runs; in-memory data simply resets on restart.

### Demo Accounts

All accounts share the password **`password123`**:

| Role | Email | Department |
|---|---|---|
| Citizen | `citizen@demo.com` | — |
| Official | `official@demo.gov` | Waste Management |
| Field worker | `worker@demo.gov` | Waste Management |

Also seeded: `roads@demo.gov`, `drainage@demo.gov`, `worker2@demo.gov`, `citizen2..4@demo.com`.

---

## Demo Script

1. **Citizen** signs in → *Report an issue*. GPS fills the pin; the map shows a 50 m radius.
2. Pick **Garbage / Waste** near the seeded cluster → the duplicate panel appears with distances.
   Submission is blocked until you either support an existing report or say none of them match.
3. **Support** an existing issue → its priority score rises immediately.
4. **Official** signs in → queue sorted by priority. Open a complaint: the panel explains the
   score part by part. *Verify* starts the SLA clock, then assign a department and field worker.
5. **Field worker** signs in → *Start work*, upload a resolution photo, mark resolved.
6. **Citizen** gets a verification request → **reject** it (complaint reopens with a fresh SLA
   clock) or **confirm** it (complaint closes).
7. The **Transparency** page and the dashboard's **Analytics** tab update live.

> 💡 To demo an SLA breach without waiting, shorten a category's `slaHours` in
> [`server/config.js`](server/config.js) — the cron tick runs every minute.

---

## Verification

```bash
npm test
```

[`server/flow.test.js`](server/flow.test.js) drives the PRD's **Definition of Done (§28)** over
real HTTP — no manual database edits:

- report creation with photo, location, routed department and explainable score
- duplicate detection inside/outside the 50 m radius, category filtering
- support → priority escalation, guarded status transitions, assignment
- resolve with required evidence → citizen rejects → reopen → resolve → close (full timeline)
- SLA breach flagged by the cron tick + escalation notification to the department
- dashboard / analytics / hotspots / public stats (and no PII on the public endpoint)
- access control: anonymous → `401`, wrong role → `403`, bad credentials → `401`

## API Reference

Base URL: `http://localhost:4000/api/v1` — all endpoints return JSON; authenticated routes
expect `Authorization: Bearer <token>`.

### Health

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/health` | — | Liveness probe → `{ ok: true }` |

### Authentication — `/auth`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | — | Self-service signup (**citizen role only**; staff come from the seed). Requires `name`, `email`, `password` (≥ 6 chars); optional `phone`, `ward` |
| POST | `/auth/login` | — | Returns `{ token, user }`. Rate-limited: 20 failed attempts / 15 min |
| POST | `/auth/logout` | — | Client-side token drop (stateless JWT) |
| GET | `/auth/me` | ✓ | Current user (password hash never leaves the server) |

### Reports — `/reports`

| Method | Endpoint | Role | Description |
|---|---|---|---|
| POST | `/reports` | citizen | Multipart: `category`, `description`, `severity`, `lng`, `lat`, `ward?`, `address?`, `image?` → `201` with routed department + priority. Rate-limited per account |
| GET | `/reports/nearby?lng&lat&category?&radius?` | any | Duplicate candidates via `$geoNear`, ≤ 5 matches with distance in metres |
| GET | `/reports?status&category&ward&department&priority&overdue&mine&assigned&q` | any | Filterable queue listing |
| GET | `/reports/:id` | any | By ObjectId **or** `complaintId`, full timeline |
| POST | `/reports/:id/support` | citizen | Back an existing report (raises its score); guards: own report, double support, closed issue |
| DELETE | `/reports/:id/support` | citizen | Withdraw support |
| PATCH | `/reports/:id` | official, worker | Generic guarded status move (`{ status, note }`) — e.g. verify starts the SLA clock |
| PATCH | `/reports/:id/assign` | official | `{ department?, workerId?, note? }` → moves to `ASSIGNED`, notifies worker & reporter |
| PATCH | `/reports/:id/resolve` | worker*, official | Multipart `{ image, note }` — **resolution photo required** → `RESOLVED_PENDING` |
| POST | `/reports/:id/verify` | reporter, official | Citizen confirms → `CLOSED` |
| POST | `/reports/:id/reopen` | reporter | `{ reason }` required → `REOPENED` with a **fresh SLA deadline** |

\* a worker may only resolve reports assigned to them.

### Administration — `/admin` *(officials only)*

| Method | Endpoint | Description |
|---|---|---|
| GET | `/admin/dashboard` | Counts by status, high-priority, SLA-breached, reopened |
| GET | `/admin/analytics` | Aggregates by category, status, ward, department (resolution rate, avg hours) |
| GET | `/admin/sla-breaches` | Open overdue reports, earliest deadline first |
| GET | `/admin/hotspots` | Grid-bucketed clusters of open reports (threshold `HOTSPOT_MIN`) |
| GET | `/admin/workers?department=` | Assignable field workers |

### Public & Notifications

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/public/stats` | — | Transparency page data: resolution rate, averages, wards, departments, hotspots — **no PII** |
| GET | `/notifications` | ✓ | Latest 50 + unread count (client polls every 30 s) |
| PATCH | `/notifications/read` | ✓ | Mark all (or one, by `id`) as read |

---

## Priority Scoring

`scoreReport()` in [`server/config.js`](server/config.js) returns the score **and every
component**, and the official UI renders the breakdown:

| Component | Formula | Range |
|---|---|---|
| Severity | `min(severity, 5) × 10` | 10 – 50 |
| Community support | `min(supporters × 5, 20)` | 0 – 20 |
| Age | `min(floor(ageDays) × 3, 10)` | 0 – 10 |
| Category weight | per-category (e.g. waterlogging 20, tree 8) | 6 – 20 |
| Sensitive ward | flat bonus for configured wards (hospitals, schools…) | +5 |
| **Total** | capped at 100 | **0 – 100** |

**Levels:** `≥ 70 → High` · `≥ 40 → Medium` · otherwise `Low`. Scores are recomputed on every
support and by the per-minute cron tick (age component), and stored so the queue can sort on them.

## Status Lifecycle

```
SUBMITTED ──▶ VERIFIED ──▶ ASSIGNED ──▶ IN_PROGRESS ──▶ RESOLVED_PENDING ──▶ CLOSED ✅
                                   ▲                        │                   citizen confirms
                       verify starts the SLA clock         │
                                                           │ citizen rejects with a reason
                                                           ▼
                                                        REOPENED ──▶ ASSIGNED / IN_PROGRESS
                                                     (fresh SLA clock)   work resumes
```

Allowed moves and the roles permitted to make them live in `TRANSITIONS`
([`server/config.js`](server/config.js)) — every other move is rejected with `409`.

## Configuration

Two layers, both designed so a department can tune behaviour **without touching application code**:

### 1. Environment variables — [`server/.env`](server/.env.example) *(all optional)*

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | API port |
| `MONGO_URI` | *(in-memory)* | Real MongoDB (Atlas or local). Omit for a throwaway in-memory server |
| `JWT_SECRET` | dev-only value | Token signing — set a real secret before any public deployment |
| `CLOUDINARY_URL` | *(local disk)* | Cloudinary hosting for photos; omit to write to `server/uploads/` |
| `DUPLICATE_RADIUS_M` | `50` | Duplicate-detection radius in metres |
| `SENSITIVE_WARDS` | `Ward 1,Ward 4` | Comma-separated wards that earn the +5 urgency bonus |
| `HOTSPOT_MIN` | `3` | Minimum open reports in a grid cell to flag a hotspot |
| `REPORT_RATE_LIMIT` | `20` | Reports allowed per account per 15 minutes |

### 2. Business rules — [`server/config.js`](server/config.js)

Category → department routing, priority weights, per-category SLA hours, ward list, and the
status transition table (which role may make which move).

### Categories, routing & SLA

| Category | Department | Weight | SLA |
|---|---|---|---|
| Garbage / Waste | Waste Management | 12 | 24 h |
| Pothole / Road Damage | Roads | 14 | 72 h |
| Water Leakage | Water | 16 | 24 h |
| Drainage | Drainage | 14 | 48 h |
| Waterlogging | Drainage | 20 | 12 h |
| Streetlight | Electrical | 10 | 72 h |
| Illegal Dumping | Waste Management | 14 | 48 h |
| Pollution | Environment | 16 | 48 h |
| Damaged Public Infrastructure | Public Works | 14 | 72 h |
| Tree / Green Area Issue | Environment | 8 | 72 h |
| Other | Public Works | 6 | 72 h |

---

## Project Structure

```
Demo/
├── package.json          # workspace orchestrator: setup · dev · dev:web · seed · test · build
├── server/               # Express 5 API (ES modules)
│   ├── config.js         # categories → department, weights, SLA hours, transitions, scoring
│   ├── db.js             # Mongoose models, connection, in-memory fallback, notify()
│   ├── auth.js           # register / login / me, JWT, requireAuth + requireRole
│   ├── reports.js        # create, nearby, support, assign, resolve, verify, reopen, uploads
│   ├── admin.js          # dashboard, analytics, hotspots, SLA breaches, public stats, notifications
│   ├── index.js          # Express app + node-cron tick (SLA breaches, priority ageing)
│   ├── seed.js           # departments, staff, citizens, 8 demo reports around Ranchi
│   ├── flow.test.js      # Definition of Done as one runnable check
│   └── .env.example      # every optional knob, documented
└── client/               # React SPA (Vite 7 + Tailwind CSS 4)
    ├── vite.config.js    # dev server + /api & /uploads proxy → :4000
    └── src/
        ├── api.js        # Axios instance, token handling, shared constants
        ├── ui.jsx        # shared primitives, Leaflet maps, timeline, evidence, useApi
        ├── App.jsx       # routing, auth context, role-based nav, notification bell
        └── pages/        # Login, NewReport, MyReports, Dashboard, Worker, PublicStats
```

---

## The Five Differentiators

| Idea | Implementation |
|---|---|
| Crowdsourced consolidation | `POST /reports/:id/support` — double-support, own-report and closed-issue guards |
| Geospatial intelligence | `GET /reports/nearby` — `$geoNear` on a `2dsphere` index, category-matched, configurable radius |
| Explainable prioritisation | `scoreReport()` returns the score *and* its parts; the official panel renders the breakdown |
| SLA accountability | `slaDeadline` set on verification per category; `tick()` flags `overdue` and notifies the department |
| Citizen-verified resolution | worker uploads evidence → `RESOLVED_PENDING` → citizen confirms (`CLOSED`) or rejects (`REOPENED`) |

---

## Out of Scope (PRD §27)

WhatsApp bot · voice reporting · gamification · AI image classification · predictive analytics ·
video reporting · multi-level escalation. Firebase push is also deferred — notifications are
in-app and polled every 30 seconds.

---

<div align="center">
<sub>Smart India Hackathon · Problem <b>SIH25031</b> · Government of Jharkhand · Clean &amp; Green Technology</sub>
</div>