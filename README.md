# 🎵 Streamify — Music Streaming Platform

> A web-only music streaming platform built with a **TypeScript microservices** backend and a **React 18 SPA** frontend. Spotify-inspired, built from scratch as a production-grade reference architecture.

---

## 📋 What Has Been Done (Steps 1–9)

This document captures the architecture and integration progress up to **Step 9** of the 14-step build order. The core microservices (Auth, User, Catalog, Stream, Search, Playlist) and the React Frontend have been scaffolded, integrated, and fully tested.

---

### ✅ 1. Monorepo Foundation

The entire project is a **pnpm workspace + Turborepo** monorepo. All apps and shared packages live in a single repository.

| File | What it does |
|---|---|
| [`pnpm-workspace.yaml`](./pnpm-workspace.yaml) | Tells pnpm that `apps/*` and `packages/*` are workspace members |
| [`package.json`](./package.json) | Root manifest — holds all dev tooling (`turbo`, `eslint`, `prettier`, `husky`, `typescript`) |
| [`turbo.json`](./turbo.json) | Turborepo pipeline — task ordering (`build`, `dev`, `lint`, `type-check`, `test`, `clean`) with caching |

---

### ✅ 2. TypeScript Configuration

A **single root `tsconfig.json`** with `strict: true` that every service extends.

| Setting | Value |
|---|---|
| `strict` | `true` |
| `noUnusedLocals` | `true` |
| `noUnusedParameters` | `true` |
| `noImplicitReturns` | `true` |
| `target` | `ES2022` |
| `module` | `NodeNext` |
| `incremental` | `true` (faster rebuilds) |

Each service simply does:
```json
{ "extends": "../../tsconfig.json", "compilerOptions": { "outDir": "./dist" } }
```

---

### ✅ 3. ESLint + Prettier

**[`.eslintrc.js`](./.eslintrc.js)** — Strict TypeScript linting:
- `@typescript-eslint/no-explicit-any: error` — zero `any` types allowed
- `@typescript-eslint/consistent-type-imports` — enforces `import type`
- `import/order` — automatic import grouping and alphabetization
- Override for React web app (browser env + react-hooks plugin)
- Override for test files (relaxed rules)

**[`.prettierrc.js`](./.prettierrc.js)** — Single quotes, trailing commas, LF line endings, 100-char print width

---

### ✅ 4. Git Hooks (Husky + lint-staged)

**[`.husky/pre-commit`](./.husky/pre-commit)** — Runs `lint-staged` on staged files only before every commit.

**[`.husky/commit-msg`](./.husky/commit-msg)** — Enforces **Conventional Commits** format:
- Valid: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `perf:`, `ci:`, `build:`, `revert:`
- Example: `feat(auth): add Google OAuth2 login`

---

### ✅ 5. Shared Packages (`packages/`)

Three internal packages imported by all services via `workspace:*`.

#### `@streamify/shared-types` — [`packages/shared-types/`](./packages/shared-types/)

Central TypeScript type definitions for the entire system:

- **Auth** — `TokenPair`, `JwtPayload`
- **Users** — `UserProfile`, `UserPreferences`
- **Catalog** — `Track`, `Album`, `Artist`, `TrackStatus`
- **Playlists** — `Playlist`, `PlaylistVisibility`
- **Stream** — `StreamUrl`
- **Search** — `SearchResults`, `SearchSuggestion`
- **RabbitMQ Events** — `BaseEvent`, `TrackPlayedPayload`, `TrackUploadedPayload`, `UserRegisteredPayload`, `UserFollowedPayload`, `ArtistNewReleasePayload`, `SearchPerformedPayload`
- **API Shapes** — `PaginatedResponse<T>`, `ApiSuccess<T>`, `ApiError`

#### `@streamify/shared-middleware` — [`packages/shared-middleware/`](./packages/shared-middleware/)

Shared Express middleware barrel (stubs, implemented in Step 2+):
- `AppError` — custom error class with HTTP status
- `catchAsync` — wraps async handlers to avoid unhandled rejections
- `errorHandler` — global Express error middleware
- `notFound` — 404 handler
- `authenticate` — JWT verification middleware
- `httpLogger` / `logger` — Pino structured JSON logger
- `validate` — Zod schema validation middleware factory

#### `@streamify/shared-utils` — [`packages/shared-utils/`](./packages/shared-utils/)

Utility helpers barrel (stubs, implemented in Step 2+):
- `sendSuccess` / `sendError` — standardised JSON response helpers
- `paginate` — cursor/page pagination helper
- `slugify` — URL-safe slug generator
- `sleep` — promise-based delay
- `pick` / `omit` — object property utilities
- `generateId` — UUID v4 generator

---

### ✅ 6. Application Services (`apps/`)

Every service has been scaffolded with correct dependencies, a runnable `src/index.ts`, a `Dockerfile`, and (where needed) a `.env.example`.

| Service | Port | Database | Key Dependencies |
|---|---|---|---|
| [`api-gateway`](./apps/api-gateway/) | 3000 | — | `http-proxy-middleware`, `express-rate-limit`, `helmet`, `cors` |
| [`auth-service`](./apps/auth-service/) | 3001 | PostgreSQL | `@prisma/client`, `bcryptjs`, `jsonwebtoken`, `googleapis`, `ioredis` |
| [`user-service`](./apps/user-service/) | 3002 | MongoDB | `mongoose`, `@aws-sdk/client-s3`, `multer`, `amqplib` |
| [`catalog-service`](./apps/catalog-service/) | 3003 | PostgreSQL | `@prisma/client`, `@aws-sdk/s3-request-presigner`, `amqplib` |
| [`stream-service`](./apps/stream-service/) | 3004 | S3 + CloudFront | `fluent-ffmpeg`, `@aws-sdk/cloudfront-signer`, `amqplib` |
| [`search-service`](./apps/search-service/) | 3005 | Elasticsearch | `@elastic/elasticsearch`, `ioredis`, `amqplib` |
| [`playlist-service`](./apps/playlist-service/) | 3006 | MongoDB | `mongoose`, `zod` |
| [`recommendation-service`](./apps/recommendation-service/) | 3007 | MongoDB + Redis | `mongoose`, `ioredis`, `amqplib` |
| [`notification-service`](./apps/notification-service/) | internal | — | `nodemailer`, `firebase-admin`, `amqplib` |
| [`analytics-service`](./apps/analytics-service/) | internal | ClickHouse | `@clickhouse/client`, `amqplib` |
| [`web`](./apps/web/) | 5173 | — | `react@18`, `vite`, `tailwindcss`, `zustand`, `@tanstack/react-query@5`, `hls.js`, `react-router-dom@6` |

**What each backend service `src/index.ts` already includes:**
- Express app with `helmet()`, `cors()`, `express.json()`
- `GET /health` endpoint returning `{ service, status, timestamp }`
- Database connection bootstrap (Mongoose for MongoDB services)
- Commented route stubs ready to be uncommented in future steps
- Fully functional CRUD controllers for Playlists, tested via the Frontend
- Standardized Mongoose `toJSON` transforms to map `_id` to `id` for frontend compatibility

---

### ✅ 7. Web App (`apps/web/`)

| File | Purpose |
|---|---|
| [`vite.config.ts`](./apps/web/vite.config.ts) | `@/` path alias, dev proxy → API gateway, manual chunk splits |
| [`index.html`](./apps/web/index.html) | HTML shell with SEO meta description |
| [`src/main.tsx`](./apps/web/src/main.tsx) | React 18 root with `QueryClientProvider` + `BrowserRouter` |
| [`src/App.tsx`](./apps/web/src/App.tsx) | All 12 routes: `/`, `/search`, `/library`, `/discover`, `/login`, `/register`, `/settings`, `/track/:id`, `/album/:id`, `/artist/:id`, `/playlist/:id` |
| [`src/index.css`](./apps/web/src/index.css) | Tailwind directives + dark theme (`#121212`) base |

---

### ✅ 8. Docker Setup

**[`docker-compose.yml`](./docker-compose.yml)** — `docker-compose up` starts the full stack.

| Container | Image | Port(s) |
|---|---|---|
| `streamify-postgres` | `postgres:16-alpine` | 5432 |
| `streamify-mongodb` | `mongo:7` | 27017 |
| `streamify-redis` | `redis:7-alpine` | 6379 |
| `streamify-rabbitmq` | `rabbitmq:3.13-management-alpine` | 5672, **15672** (UI) |
| `streamify-elasticsearch` | `elasticsearch:8.14.0` | 9200 |
| + all 11 application services | — | see above |

Every service Dockerfile uses a **3-stage multi-stage build** (`deps → builder → runner`). `stream-service` additionally installs `ffmpeg` in the runner.

---

### ✅ 9. Environment Variables

| Service | Template |
|---|---|
| auth-service | [`apps/auth-service/.env.example`](./apps/auth-service/.env.example) |
| user-service | [`apps/user-service/.env.example`](./apps/user-service/.env.example) |
| catalog-service | [`apps/catalog-service/.env.example`](./apps/catalog-service/.env.example) |
| stream-service | [`apps/stream-service/.env.example`](./apps/stream-service/.env.example) |
| web | [`apps/web/.env.example`](./apps/web/.env.example) |

---

### ✅ 10. CI/CD Pipeline

**[`.github/workflows/ci.yml`](./.github/workflows/ci.yml)** — Runs on every push/PR to `main` or `develop`:

```
Job 1: lint       →  pnpm lint + pnpm type-check
Job 2: build      →  pnpm build  (Turborepo builds all packages + apps)
Job 3: test       →  pnpm test   (with Postgres + Redis service containers)
```

Concurrent runs on the same branch are auto-cancelled.

---

## 📁 Full Directory Tree

```
Streamify-microservices/
├── .eslintrc.js
├── .prettierrc.js / .prettierignore
├── .gitignore
├── .husky/
│   ├── pre-commit        ← lint-staged
│   └── commit-msg        ← Conventional Commits
├── .github/workflows/
│   └── ci.yml            ← GitHub Actions CI
├── turbo.json
├── tsconfig.json         ← Root strict TS config
├── pnpm-workspace.yaml
├── package.json          ← Root devDeps
├── docker-compose.yml
├── README.md
│
├── packages/
│   ├── shared-types/     ← @streamify/shared-types
│   ├── shared-middleware/ ← @streamify/shared-middleware
│   └── shared-utils/     ← @streamify/shared-utils
│       (each has: package.json, tsconfig.json, src/index.ts)
│
├── apps/
│   ├── web/              ← React 18 SPA (port 5173)
│   │   ├── vite.config.ts
│   │   ├── index.html
│   │   └── src/ (main.tsx, App.tsx, index.css)
│   ├── api-gateway/      ← port 3000
│   ├── auth-service/     ← port 3001  (.env.example, Dockerfile)
│   ├── user-service/     ← port 3002  (.env.example, Dockerfile)
│   ├── catalog-service/  ← port 3003  (.env.example, Dockerfile)
│   ├── stream-service/   ← port 3004  (.env.example, Dockerfile)
│   ├── search-service/   ← port 3005  (Dockerfile)
│   ├── playlist-service/ ← port 3006  (Dockerfile)
│   ├── recommendation-service/ ← port 3007 (Dockerfile)
│   ├── notification-service/   ← internal  (Dockerfile)
│   └── analytics-service/      ← internal  (Dockerfile)
│       (each has: package.json, tsconfig.json, src/index.ts)
│
└── infra/docker/
    └── Dockerfile.base   ← Shared multi-stage template
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** ≥ 20
- **pnpm** ≥ 8 — `npm install -g pnpm`
- **Docker** + **Docker Compose**

### 1. Install dependencies
```bash
pnpm install
```

### 2. Copy environment files
```bash
cp apps/auth-service/.env.example    apps/auth-service/.env.local
cp apps/user-service/.env.example    apps/user-service/.env.local
cp apps/catalog-service/.env.example apps/catalog-service/.env.local
cp apps/stream-service/.env.example  apps/stream-service/.env.local
cp apps/web/.env.example             apps/web/.env.local
```
Fill in secrets in each `.env.local` (never commit these).

### 3. Start infrastructure only
```bash
docker-compose up postgres mongodb redis rabbitmq elasticsearch -d
```

### 4. Run all services in dev mode
```bash
pnpm dev
```

### 5. Open the app
| URL | Service |
|---|---|
| http://localhost:5173 | Web app |
| http://localhost:3000 | API Gateway |
| http://localhost:15672 | RabbitMQ Management UI |
| http://localhost:9200 | Elasticsearch |

---

## 🛠️ Available Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start all services with hot-reload |
| `pnpm build` | Build all packages + apps |
| `pnpm lint` | ESLint all workspaces |
| `pnpm type-check` | TypeScript check all workspaces |
| `pnpm test` | Run all tests |
| `pnpm clean` | Delete all `dist/` + `.tsbuildinfo` |
| `pnpm --filter @streamify/auth-service dev` | Run a single service |
| `docker-compose up` | Start full stack in Docker |

---

## 🗺️ Build Order & Progress

| Step | What to build | Status |
|---|---|---|
| **Step 1** | Monorepo scaffold — Turborepo, pnpm, shared packages | ✅ **Done** |
| **Step 2** | `auth-service` — PostgreSQL + Prisma + JWT + Google OAuth2 | ✅ **Done** |
| **Step 3** | `api-gateway` — JWT middleware, route protection | ✅ **Done** |
| **Step 4** | `user-service` — MongoDB + Mongoose + profile endpoints, RabbitMQ | ✅ **Done** |
| **Step 5** | `catalog-service` — Prisma + S3 presigned upload URLs | ✅ **Done** |
| **Step 6** | `stream-service` — FFmpeg HLS transcoding + CloudFront | ✅ **Done** |
| **Step 7** | `web` — Login, Home, global audio player (HLS.js) | ✅ **Done** |
| **Step 8** | `search-service` — Elasticsearch indexes + typeahead | ✅ **Done** |
| **Step 9** | `playlist-service` — CRUD + track reorder | ✅ **Done** |
| **Step 10** | RabbitMQ event wiring — all publishers & consumers | ✅ **Done** |
| **Step 11** | `notification-service` — email + web push | ⬜ Next |
| **Step 12** | `recommendation-service` — collaborative filtering | ⬜ |
| **Step 13** | `analytics-service` — ClickHouse + play event ingestion | ⬜ |
| **Step 14** | Docker Compose polish + CI/CD + Kubernetes (prod) | ⬜ |

---

## 📐 Architecture Overview

```
Browser (React SPA – port 5173)
        │
        ▼
API Gateway (port 3000)   ← single entry point, JWT validation, rate-limit
        │
        ├──► auth-service           (3001)  PostgreSQL + Redis
        ├──► user-service           (3002)  MongoDB
        ├──► catalog-service        (3003)  PostgreSQL + S3
        ├──► stream-service         (3004)  S3 + CloudFront + FFmpeg
        ├──► search-service         (3005)  Elasticsearch + Redis
        ├──► playlist-service       (3006)  MongoDB
        └──► recommendation-service (3007)  MongoDB + Redis

RabbitMQ (async event bus)
        ├──► notification-service   (internal)  Nodemailer + Firebase FCM
        └──► analytics-service      (internal)  ClickHouse
```

---

## 🤝 Contributing

- Commits **must** follow [Conventional Commits](https://www.conventionalcommits.org/) — enforced by the `commit-msg` git hook
- Pre-commit hook auto-runs ESLint + Prettier on staged files
- PRs must pass CI: **lint → type-check → build → test**
- Zero `any` types — enforced by `@typescript-eslint/no-explicit-any: error`
- TypeScript `strict: true` everywhere — no exceptions
