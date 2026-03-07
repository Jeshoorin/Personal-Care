# CI/CD Setup Guide

This repo now includes:

- CI workflow: `.github/workflows/ci.yml`
- CD workflow: `.github/workflows/cd.yml`
- Render blueprint: `render.yaml`
- Vercel config: `vercel.json`

Use this guide to connect everything.

## 1) What happens automatically

- On every PR and push to `main`:
  - install
  - lint
  - test
  - build
- On push to `main` (and manual run):
  - run verify job (lint/test/build)
  - deploy web to Vercel (if Vercel secrets exist)
  - trigger API deploy on Render (if Render deploy hook secret exists)

## 2) GitHub Secrets to add

In GitHub repo:

- Settings -> Secrets and variables -> Actions -> New repository secret

Add:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `RENDER_DEPLOY_HOOK_URL`

Without these secrets, deployment jobs are skipped safely.

## 3) Vercel setup (Frontend)

1. Create a Vercel project from this GitHub repo.
2. Set project root as repo root (this repo includes `vercel.json`).
3. In Vercel project settings, add environment variable:
   - `VITE_API_BASE_URL=https://<your-render-service>.onrender.com`
4. Get the following from Vercel:
   - `VERCEL_TOKEN`
   - `VERCEL_ORG_ID`
   - `VERCEL_PROJECT_ID`
5. Put those values into GitHub secrets.

## 4) Render setup (Backend API)

1. Create a Render Web Service from this GitHub repo.
2. Use these commands:
   - Build command:
     - `npm ci && npm run build --workspace @personal-care/shared-types && npm run build --workspace @personal-care/api`
   - Start command:
     - `npm run start --workspace @personal-care/api`
3. Set environment variables in Render:
   - `NODE_ENV=production`
   - `PORT=10000` (or keep Render default)
   - `API_BASE_URL=https://<your-render-service>.onrender.com`
   - `WEB_ORIGIN=https://<your-vercel-domain>`
   - `GOOGLE_CLIENT_ID=<...>`
   - `GOOGLE_CLIENT_SECRET=<...>`
   - `GOOGLE_REDIRECT_URI=https://<your-render-service>.onrender.com/auth/google/callback`
   - `JWT_SECRET=<random long secret>`
   - `ENCRYPTION_KEY=<random long secret>`
   - `CRON_SECRET=<random long secret>`
   - `DATABASE_URL=<neon or blank for temporary memory mode>`
   - `VAPID_PUBLIC_KEY=<optional for push>`
   - `VAPID_PRIVATE_KEY=<optional for push>`
   - `VAPID_SUBJECT=<optional for push>`
4. In Render service settings, create a Deploy Hook URL.
5. Put Deploy Hook URL into GitHub secret:
   - `RENDER_DEPLOY_HOOK_URL`

## 5) Google OAuth production update

In Google Cloud OAuth credentials:

- Add JavaScript origins:
  - `http://localhost:5173`
  - `https://<your-vercel-domain>`
- Add redirect URIs:
  - `http://localhost:4000/auth/google/callback`
  - `https://<your-render-service>.onrender.com/auth/google/callback`

If app is in testing mode, add your email to OAuth test users.

## 6) Verify CI/CD end-to-end

1. Push a commit to `main`.
2. Open GitHub -> Actions.
3. Confirm:
   - `CI` passed.
   - `CD` verify passed.
   - `deploy-web-vercel` succeeded.
   - `deploy-api-render` succeeded.
4. Open:
   - Vercel URL
   - Login with Google
   - Confirm API health at:
     - `https://<your-render-service>.onrender.com/health`

## 7) Security notes

- Never commit `.env`.
- Rotate any secret that was shared in chat/messages.
- Keep `GOOGLE_CLIENT_SECRET`, `JWT_SECRET`, and `ENCRYPTION_KEY` only in platform secret stores.
