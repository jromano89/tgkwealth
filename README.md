# TGK Demo Platform

TGK Wealth is a financial services demo portal for DocuSign Solution Consultants. It shows how DocuSign IAM can appear in realistic advisor and investor workflows without turning every new demo into another full-stack build.

The current frontend is specific to wealth management. The backend is not. It is intentionally modular, CORS-enabled, and app-scoped so future demo frontends can reuse the same auth, proxying, data, webhook, and Maestro surfaces from their own static sites.

## What This Repo Contains

- `frontend/`: the single static TGK Wealth frontend in this repo
- `backend/`: the reusable demo backend and SQLite store
- `scripts/seed-demo-api.js`: optional public-API seed script

This repo intentionally carries one frontend. If a future vertical needs its own experience, it can live in a different repo and still target the same backend contract.

## Current Demo

- Vertical: financial services
- Scenario: advisor and investor experiences around a private wealth relationship
- Frontend: two static portals, one for the advisor and one for the investor
- App slug: `tgk-wealth`

The point of TGK Wealth is not just to demo one workflow. It is to show a believable operating context for IAM: customer onboarding, transfer-related work, documents, tasks, and external data enrichment from both sides of the relationship.

## Why The Project Is Shaped This Way

- The frontend stays static. There is no frontend build step.
- The backend stays reusable. App state is scoped by slug.
- The generic services are what matter long term: auth, proxying, CRUD, webhooks, and Maestro.
- The vertical-specific storytelling belongs in the frontend, seed data, and configuration.

The long-term ambition is simple: if an SC wants a new demo for another vertical, they should mostly need a small static website and some tailored data, not a fresh full-stack app.

## Architecture

- `frontend/config.js`: the only frontend config file in this repo
- `frontend/advisor/` and `frontend/investor/`: the two portal entrypoints
- `frontend/shared/`: shared client code, styles, and UI pieces
- `backend/src/routes/`: thin HTTP entrypoints
- `backend/src/resources/`: generic app-scoped resource CRUD and serialization
- `backend/src/docusign-auth.js`: shared DocuSign auth helpers
- `backend/src/maestro/`: backend-hosted Maestro manifest and Data IO integration

Canonical backend rules:

- Send `X-Demo-App` on app-scoped requests, or use `?app=<slug>`
- Use camelCase in API requests and expect camelCase in API responses
- Treat `employees`, `customers`, `tasks`, and `envelopes` as the reusable platform records
- Keep vertical-specific details inside `data`

Internally, SQL stays snake_case. The API and frontend stay camelCase.

## Runtime Model

- Frontend: static HTML, CSS, and JavaScript
- Backend: Express + SQLite
- Auth: DocuSign connection state is stored per app slug
- Proxy: `/api/proxy` is the generic outbound pass-through
- Maestro: mounted directly by the backend under `/maestro/*`

This is demo infrastructure, not production infrastructure. Open CORS, SQLite, and simplified auth handling are intentional trade-offs.

## Local Development

1. Install backend dependencies and create `backend/.env`.

```bash
cd backend
cp .env.example .env
npm install
cd ..
```

2. Fill in the required DocuSign values in `backend/.env`.

Required:

- `DOCUSIGN_INTEGRATION_KEY`
- `DOCUSIGN_RSA_PRIVATE_KEY`
- `DOCUSIGN_SECRET_KEY`

Common optional values:

- `TGK_DB_PATH`
- `DOCUSIGN_OAUTH_BASE`
- `DOCUSIGN_API_BASE`
- `MAESTRO_PUBLIC_BASE_URL`
- `MAESTRO_APP_SLUG`
- `MAESTRO_CLIENT_ID`
- `MAESTRO_CLIENT_SECRET`
- `MAESTRO_ACCESS_TOKEN`

3. Start the backend.

```bash
npm run dev:backend
```

4. Serve the static frontend with any simple file server.

```bash
python3 -m http.server 8080 --directory frontend
```

5. Open the demo:

- [http://localhost:8080/](http://localhost:8080/)
- [http://localhost:8080/advisor/](http://localhost:8080/advisor/)
- [http://localhost:8080/investor/](http://localhost:8080/investor/)
- [http://localhost:3000/api/health](http://localhost:3000/api/health)
- [http://localhost:3000/api/openapi.json](http://localhost:3000/api/openapi.json)
- [http://localhost:3000/maestro/health](http://localhost:3000/maestro/health)

## Frontend Configuration

`frontend/config.js` is the single config surface for the frontend.

It controls:

- `appSlug`
- `backendUrl`
- optional `advisorId`
- workflow IDs
- role-specific labels and portal names

The file already switches between local and deployed backend URLs based on hostname. Before deployment, replace the placeholder Railway backend URL in `frontend/config.js`.

Advisor details should come from the backend. `advisorId` is only a preferred selector so the UI can pick a known seeded advisor when one exists.

## Backend API Surface

Primary routes:

- `/api/health`
- `/api/openapi.json`
- `/api/auth/*`
- `/api/data/*`
- `/api/proxy`
- `/api/webhooks/*`
- `/maestro/*`

The backend is designed so a future demo frontend can reuse these routes with a new static UI and a different app slug.

## Demo Data And Seeding

The backend does not auto-seed data.

If you want a populated TGK Wealth environment, use the optional seed script:

```bash
node scripts/seed-demo-api.js
```

Optional envs:

- `TGK_SEED_BASE_URL`
- `TGK_SEED_APP_SLUG`

The seed script only uses public backend APIs. It does not write to the database directly.

## Working Notes

- Keep route files thin.
- Prefer extending shared backend behavior over adding TGK-only backend logic.
- Keep the frontend static unless there is a strong reason not to.
- If a future demo needs its own frontend, build it outside this repo unless it is replacing TGK Wealth here.

## Deployment Shape

The intended deployment is simple:

- one static frontend host
- one backend service
- one persistent SQLite volume

That shape is enough for the current TGK Wealth demo and keeps the path clear for future reusable demo frontends.
