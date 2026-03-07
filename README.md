# Personal Care

Personal health assistant PWA with React + Node.js, Google OAuth, Google Sheets storage, gamification, and reminders.

## Monorepo

- `apps/web`: React + Vite + Tailwind PWA client
- `apps/api`: Express + TypeScript REST API
- `packages/shared-types`: shared contracts and health calculation utilities

## Quick Start

1. Copy environment templates:
   - `apps/api/.env.example` -> `apps/api/.env`
   - `apps/web/.env.example` -> `apps/web/.env`
2. Install dependencies:
   - `npm install`
3. Start web + API:
   - `npm run dev`

## Scripts

- `npm run dev`: run API and web in parallel
- `npm run build`: build shared package, API, and web
- `npm run test`: run shared + API tests.

## CI/CD

- CI workflow: `.github/workflows/ci.yml`
- CD workflow: `.github/workflows/cd.yml`
- Full setup guide: [`docs/CI_CD_SETUP.md`](docs/CI_CD_SETUP.md)
