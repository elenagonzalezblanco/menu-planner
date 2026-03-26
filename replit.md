# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   └── api-server/         # Express API server
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health` (full path: `/api/health`)
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.cjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas (no models definitions exist right now)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.

### `artifacts/menu-semanal` (`@workspace/menu-semanal`)

React + Vite frontend for "La Cocina" — a Spanish weekly meal planning agent app.

- Pages: Recipes, Menu, Shopping, Mercadona
- Uses generated React Query hooks from `@workspace/api-client-react`
- Tailwind + shadcn/ui design system
- Base URL: `/`

## La Cocina App

### Features

1. **Recetas** — browse all 74 personal recipes (seeded in DB), organized by type (primero/segundo/otro)
2. **Menú Semanal** — Conversational AI agent chat panel for generating and iteratively editing the weekly menu; drag & drop between days; inline editing; horizontal print/PDF view
3. **Lista de Compra** — consolidated shopping list from the generated menu
4. **Mercadona** — Playwright-based automation to log in to tienda.mercadona.es and add ingredients to cart

### Key Technical Details

- OpenAI integration uses Replit AI Integrations proxy (`AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY`)
- Model: `gpt-4o-mini` with `response_format: json_object`
- Mercadona web automation: `playwright-extra` + `puppeteer-extra-plugin-stealth` (stealth mode to reduce reCAPTCHA detection) + system Chromium
- **Login flow**: type email slowly → "Continuar" → wait for password field → type password → click "Entrar" (12s wait for redirect)
- Mercadona login often fails due to Mercadona's reCAPTCHA anti-bot. Items are searched but login may not succeed. UI shows per-item search links as fallback.
- Mercadona credentials stored in `mercadona_settings` table (email, password, postalCode)
- Recipes are categorized as `primero` (soups/salads), `segundo` (mains), `otro` (sides/misc)
- **Historical preferences**: `menus.ts` embeds 5-week learned history of user's meal combinations directly in the prompt (HISTORICAL_CONTEXT constant). Key patterns: Vichyssoise→Merluza, Sopa calabacín→Merluza frita, Jueves=Sandwich, weekly rotation of Albóndigas/Gazpacho/Judías verdes/Setas/Arroz blanco
- `primero` can be `null` in menu JSON — the prompt supports it and Menu.tsx handles it gracefully

### DB Schema

- `recipes` — 74 personal recipes with name, description, ingredients, type
- `weekly_menus` — AI-generated weekly menus (JSON structure with 7 days × lunch/dinner)
- `shopping_lists` + `shopping_list_items` — consolidated shopping lists from menus
- `mercadona_settings` — single-row credentials table for Mercadona automation

### API Routes

- `GET /api/recipes` — list all recipes
- `POST /api/menus/generate` — generate weekly menu with OpenAI (`{ daysCount, preferences? }`)
- `POST /api/menus/chat` — conversational agent: generate or modify menu via chat (`{ message, history, menuId? }`); returns `{ reply, updatedMenu }`
- `GET /api/menus` — list all menus
- `POST /api/shopping/generate` — generate shopping list from menu
- `GET /api/shopping/:menuId` — get shopping list for menu
- `GET /api/mercadona/credentials` — check if Mercadona credentials are saved
- `POST /api/mercadona/credentials` — save credentials
- `DELETE /api/mercadona/credentials` — delete credentials
- `POST /api/mercadona/automate` — run Playwright automation to add ingredients to cart
