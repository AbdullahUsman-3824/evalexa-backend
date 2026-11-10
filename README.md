# Evalexa Backend

**AI-powered recruitment platform backend** built with NestJS, Prisma, and PostgreSQL.

Evalexa helps companies hire faster through automated resume screening, AI-driven candidate ranking, intelligent shortlisting, and AI interview workflows. This repository contains the core REST API that powers recruiters, candidates, and public job discovery.

> Live API: [evalexa-backend.vercel.app](https://evalexa-backend.vercel.app)  
> Frontend: [evalexa-frontend.vercel.app](https://evalexa-frontend.vercel.app)

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database & Prisma](#database--prisma)
- [API Overview](#api-overview)
- [Background Processing](#background-processing)
- [AI Integration (FastAPI)](#ai-integration-fastapi)
- [Authentication](#authentication)
- [Scripts](#scripts)
- [Documentation](#documentation)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

Evalexa is an end-to-end recruitment platform that automates the most time-consuming parts of hiring:

1. **Job posting** with rich skill requirements and AI configuration
2. **Candidate applications** (public form + bulk resume upload)
3. **Resume parsing & analysis** via a dedicated FastAPI AI service
4. **Ranking & auto-shortlisting** based on match scores
5. **AI interview generation, transcription, and evaluation**
6. **Public job/company discovery** for candidates

The backend is a modular NestJS application that orchestrates domain logic, queues, scheduled tasks (via Upstash QStash), and external AI services.

---

## Key Features

| Area | Capabilities |
|------|--------------|
| **Jobs** | Create/update jobs with skills, salary, deadlines, AI config (auto-shortlist, interview selection counts) |
| **Applications** | Public apply, bulk resume upload, status tracking, match scores, ranking |
| **AI Processing** | Resume parse → analysis → ranking → shortlisting pipeline with retry support |
| **Interviews** | Invitation management, question generation, transcription, evaluation |
| **Public API** | Open jobs & companies listing, search/filter/sort, public application submission |
| **Auth** | JWT + cookie-based sessions, role-based access (recruiter guards) |
| **Companies & Users** | Multi-user companies, recruiter roles, profile management |
| **Skills** | Normalized skill catalog with categories |
| **Scheduling** | Job deadline auto-close via QStash |
| **Storage** | Supabase for resumes, logos, and media |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js |
| Framework | NestJS 11 (TypeScript) |
| ORM | Prisma 7 + PostgreSQL |
| Queue | BullMQ + Redis (ioredis) |
| Scheduling | Upstash QStash |
| Auth | Passport + JWT + cookies |
| Validation | class-validator / class-transformer |
| File Upload | Multer (multipart) |
| Storage / Auth helpers | Supabase JS |
| AI Service | External FastAPI service (`/api/v1`) |
| Docs | Swagger-ready + markdown API docs in `/docs` |
| Email | Nodemailer |
| Deployment | Vercel (current) |

---

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Frontend       │────▶│  NestJS Backend  │────▶│  PostgreSQL     │
│  (Next.js)      │     │  (this repo)     │     │  (Prisma)       │
└─────────────────┘     └────────┬─────────┘     └─────────────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
             ┌──────────┐  ┌─────────┐  ┌──────────┐
             │  Redis   │  │ QStash  │  │ FastAPI  │
             │ (BullMQ) │  │(sched.) │  │ (AI)     │
             └──────────┘  └─────────┘  └──────────┘
                                 │
                                 ▼
                          ┌────────────┐
                          │  Supabase  │
                          │  Storage   │
                          └────────────┘
```

### Core Modules

| Module | Responsibility |
|--------|----------------|
| `auth` | Login, JWT, cookies, guards |
| `users` | User accounts & profiles |
| `company` | Company CRUD, recruiter roles |
| `jobs` | Job lifecycle & AI config |
| `skills` | Skill catalog |
| `candidate` | Candidate profiles |
| `resume` | Resume upload & metadata |
| `application` | Applications, bulk upload, status |
| `processing` | Queue producers/consumers, pipeline orchestration |
| `ranking` | Match scoring & ranking logic |
| `screening` | Screening-related logic |
| `interview` | Invitations, questions, evaluation |
| `public` | Unauthenticated job/company discovery & apply |
| `qstash` | Scheduled job deadline handling |

---

## Project Structure

```
evalexa-backend/
├── docs/                     # Detailed API documentation
│   ├── applications-apis.md
│   ├── candidate-apis.md
│   ├── company-apis.md
│   ├── interview-apis.md
│   ├── job-apis.md
│   ├── public-apis.md
│   └── updates.md
├── prisma/
│   ├── schema.prisma         # Main schema (multi-file)
│   ├── *.prisma              # Domain models (company, job, application, etc.)
│   └── migrations/
├── src/
│   ├── common/               # Shared constants, FastAPI client, utilities
│   ├── database/             # Prisma / DB module
│   ├── modules/              # Feature modules (see above)
│   ├── qstash/               # Upstash QStash integration
│   ├── app.module.ts
│   ├── main.ts
│   └── ...
├── test/
├── package.json
├── nest-cli.json
├── prisma.config.ts
└── tsconfig.json
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 14+
- Redis (for BullMQ)
- FastAPI AI service running (optional for full AI features)
- Supabase project (storage + optional auth helpers)
- Upstash QStash account (for scheduled tasks)

### Installation

```bash
# Clone the repository
git clone https://github.com/AbdullahUsman-3824/evalexa-backend.git
cd evalexa-backend

# Install dependencies
npm install

# Copy environment file and fill in values
cp .env.example .env   # or create .env / .env.local manually

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev

# Start development server (watch mode)
npm run start:dev
```

The server defaults to **port 3001** (configurable via `PORT`).

### Alternative Dev Script

```bash
npm run dev          # uses nodemon
```

---

## Environment Variables

Create a `.env` or `.env.local` file in the project root. Key variables include:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection URL (supports `rediss://` for TLS) |
| `PORT` | HTTP port (default `3001`) |
| `CORS_ORIGIN` | Comma-separated allowed origins (credentials enabled) |
| `JWT_SECRET` / related | JWT signing secrets |
| `FASTAPI_URL` | Base URL of the AI FastAPI service (default `http://127.0.0.1:8000`) |
| `CLIENT_URL` | Frontend base URL used for interview invitation links |
| `QSTASH_*` | Upstash QStash token & configuration |
| Supabase keys | `SUPABASE_URL`, `SUPABASE_KEY` / service role (for storage) |
| SMTP / Nodemailer | Email credentials for invitations & notifications |

> **Note:** Exact variable names may vary; inspect `ConfigModule` usage and QStash/Supabase modules for the authoritative list.

---

## Database & Prisma

Prisma is configured with a multi-file schema under `prisma/`:

- `schema.prisma` – generator + datasource
- Domain files: `company.prisma`, `user-management.prisma`, `job-related.prisma`, `application.prisma`, `candidate.prisma`, `resume.prisma`, `resume-analysis.prisma`, `interview.prisma`, `offer.prisma`, `processing-task.prisma`, `job-processing.prisma`, `shared-enum.prisma`, etc.

### Useful Commands

```bash
npx prisma generate          # Generate client
npx prisma migrate dev       # Create & apply migration
npx prisma migrate deploy    # Production migrate
npx prisma studio            # Visual data browser
```

Build script already runs `prisma generate` before Nest build:

```bash
npm run build
```

---

## API Overview

Detailed request/response documentation lives in the [`docs/`](./docs) folder.

### Public (no auth)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/public/jobs` | List open, non-expired jobs (search, filters, sort, pagination) |
| `GET` | `/public/jobs/featured` | Featured / recent open jobs |
| `GET` | `/public/jobs/:jobSlug` | Public job detail |
| `GET` | `/public/jobs/:jobSlug/similar` | Similar jobs |
| `POST` | `/public/jobs/:jobSlug/apply` | Apply (multipart: resume + personal fields) |
| `GET` | `/public/companies` | Public companies with open-job counts |
| `GET` | `/public/companies/:companySlug` | Company detail |
| `GET` | `/public/companies/:companySlug/jobs` | Jobs for a company |

### Authenticated (Recruiter)

| Area | Base / Examples |
|------|-----------------|
| Jobs | `POST/GET/PATCH /jobs`, `GET /jobs/titles`, `GET /jobs/:id/summary` |
| Applications | `GET /application/jobs/:jobId`, `GET /application/:id`, bulk upload |
| Processing | `GET /processing/jobs/:jobId/status`, retry endpoints |
| Skills | `GET/POST/PATCH/DELETE /skills`, `GET /skills/categories` |
| Interviews | `GET /interviews/applications`, invitation send, etc. |
| Company / Users | Company profile, members, auth flows |

**Auth model:** Bearer JWT (and/or session cookies). Most recruiter endpoints require an **active recruiter** belonging to a company. Company scope is taken from the authenticated user — do **not** send `companyId` in the body.

Common pagination shape for public endpoints:

```json
{
  "items": [],
  "pagination": {
    "page": 1,
    "limit": 12,
    "totalItems": 0,
    "totalPages": 0,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

---

## Background Processing

The `processing` module orchestrates AI pipelines using **BullMQ** queues:

| Queue | Purpose |
|-------|---------|
| `application-processing` | Per-application tasks (parse, analysis) |
| `job-processing` | Job-wide ranking & shortlisting |
| `scheduled` | Scheduled work |

**Typical pipeline for a job:**

1. Resume upload / application created  
2. `RESUME_PARSE`  
3. `RESUME_ANALYSIS`  
4. `RANKING`  
5. `SHORTLISTING` (respecting AI config)  
6. Optional AI interview flow  

Status can be polled via:

```
GET /processing/jobs/:jobId/status
```

Failed tasks support retry at both application and job level.

**Job deadlines** are scheduled/cancelled through **Upstash QStash** so jobs can be auto-closed when the deadline is reached.

---

## AI Integration (FastAPI)

The backend communicates with an external FastAPI service:

```
FASTAPI_URL/api/v1
```

Key endpoints used:

| Feature | Path |
|---------|------|
| Resume parse | `/resume/parse` |
| Ranking | `/rank` |
| Interview questions | `/interview/generate-questions` |
| Transcription | `/interview/transcribe` |
| Evaluation | `/interview/evaluate` |

See `src/common/constants/fastapi.constants.ts` and the `FastApiModule` for the client implementation.

---

## Authentication

- JWT-based authentication with Passport
- Cookie support (`cookie-parser`) for session-style flows
- Role / recruiter guards protect company-scoped resources
- Public routes under `/public/*` require no authentication

CORS is configurable via `CORS_ORIGIN` (comma-separated list) and supports credentials.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run start:dev` | Nest watch mode |
| `npm run dev` | Nodemon-based development |
| `npm run start` | Nest start |
| `npm run start:prod` | Run compiled `dist/main` |
| `npm run build` | `prisma generate` + Nest build |
| `npm run lint` | ESLint with auto-fix |
| `npm run format` | Prettier |
| `npm run test` | Unit tests (Jest) |
| `npm run test:e2e` | End-to-end tests |
| `npm run test:cov` | Coverage report |

---

## Documentation

In-repo API documentation:

- [`docs/public-apis.md`](./docs/public-apis.md) – Public job & company endpoints
- [`docs/job-apis.md`](./docs/job-apis.md) – Job & skill management
- [`docs/applications-apis.md`](./docs/applications-apis.md) – Applications
- [`docs/candidate-apis.md`](./docs/candidate-apis.md) – Candidates
- [`docs/company-apis.md`](./docs/company-apis.md) – Companies
- [`docs/interview-apis.md`](./docs/interview-apis.md) – Interviews
- [`docs/updates.md`](./docs/updates.md) – Recent API shapes & processing status

Swagger UI can be enabled via `@nestjs/swagger` (already a dependency).

---

## Deployment

Current production target appears to be **Vercel** (`evalexa-backend.vercel.app`).

General checklist:

1. Set all required environment variables in the host
2. Ensure PostgreSQL and Redis are reachable
3. Run `npx prisma migrate deploy` (or equivalent) on deploy
4. Build with `npm run build` (includes Prisma client generation)
5. Start with `npm run start:prod` or the platform’s Node entrypoint
6. Configure `CORS_ORIGIN` and `CLIENT_URL` for the frontend domain
7. Point `FASTAPI_URL` at the production AI service
8. Configure QStash webhooks / schedules for job deadlines

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes with clear messages
4. Push and open a Pull Request against `main`
5. Ensure tests pass and linting is clean

Please keep domain logic inside the appropriate Nest modules and update the markdown docs under `docs/` when changing public API contracts.

---

## License

This project is currently marked as **UNLICENSED** (private). Contact the repository owner for licensing terms.

---

## Acknowledgments

- Built with [NestJS](https://nestjs.com)
- ORM by [Prisma](https://www.prisma.io)
- Queueing by [BullMQ](https://docs.bullmq.io)
- Scheduling by [Upstash QStash](https://upstash.com/docs/qstash)
- Storage & helpers via [Supabase](https://supabase.com)

---

**Evalexa** — Hire smarter. Hire faster.
