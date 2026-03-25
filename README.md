# TGK Demo Platform

Reusable Docusign demo platform for Solutions Engineers.

This repo has two parts:

- static frontends in `frontends/`
- a shared backend in `backend/`

The seeded example is `tgk-wealth`, with:

- advisor portal: `frontends/tgk-wealth/advisor/index.html`
- investor portal: `frontends/tgk-wealth/investor/index.html`

## Purpose

The backend is meant to be reused across future demo frontends so SEs do not need to rebuild the same full-stack plumbing every time.

It provides:

- app-scoped demo data
- Docusign connection state
- backend-owned Docusign JWT access
- envelope tracking
- webhook ingestion
- a generic proxy for CORS-sensitive calls

## Runtime Model

- Frontends are static.
- Demo data persists in SQLite.
- Seeding is explicit, not part of normal page load.
- Docusign is connected per app, not per browser.
- Browser sessions are only used for the temporary Docusign consent flow and multi-account selection.

## Quick Start

1. Install backend dependencies.

```bash
cd backend
cp .env.example .env
npm install
cd ..
```

2. Configure `backend/.env`.

Required values:

- `DOCUSIGN_INTEGRATION_KEY`
- `DOCUSIGN_RSA_PRIVATE_KEY`
- `DOCUSIGN_SECRET_KEY`

3. Start the backend.

```bash
npm run dev:backend
```

Local backend:

- [http://localhost:3000](http://localhost:3000)
- [http://localhost:3000/api-docs](http://localhost:3000/api-docs)

4. Seed the TGK demo once.

```bash
npm run seed:tgk
```

Force a reseed:

```bash
npm run seed:tgk -- --force
```

5. Serve the frontend directory statically.

Example:

```bash
python3 -m http.server 5500 --directory frontends
```

Local frontend:

- [http://localhost:5500/](http://localhost:5500/)
- [http://localhost:5500/tgk-wealth/advisor/](http://localhost:5500/tgk-wealth/advisor/)
- [http://localhost:5500/tgk-wealth/investor/](http://localhost:5500/tgk-wealth/investor/)

## Docusign Model

This project uses one Docusign pattern:

- browser consent redirect
- confidential-client code exchange using `DOCUSIGN_SECRET_KEY`
- backend JWT grant for actual API calls

Frontends do not call Docusign directly.

## Bootstrap Model

- Manual bootstrap endpoint: `backend/src/routes/apps.js`
- TGK seed script: `scripts/seed-tgk.js`
- TGK seed data: `frontends/tgk-wealth/demo-data.js`

The backend keeps `/api/apps/bootstrap` so future frontends can seed their own small app manifest when needed.

## Main API Areas

- `/api/apps/*`
- `/api/auth/*`
- `/api/data/*`
- `/api/envelopes/*`
- `/api/webhooks/*`
- `/api/proxy/*`

API docs: [http://localhost:3000/api-docs](http://localhost:3000/api-docs)

## Extend It

To build another frontend against this backend:

1. choose a new app slug
2. host a static frontend
3. point it at this backend
4. optionally seed app-specific demo data
5. use the shared API contract instead of building a new backend

## Important Files

- `backend/src/index.js`
- `backend/src/routes/apps.js`
- `backend/src/routes/auth.js`
- `backend/src/routes/data.js`
- `backend/src/routes/envelopes.js`
- `backend/src/routes/proxy.js`
- `backend/src/routes/webhooks.js`
- `backend/src/services/docusign-auth.js`
- `backend/src/db/database.js`
