# TGK Demo Platform

Reusable Docusign demo platform for Solutions Engineers.

This repo has three parts:

- static frontends in `frontends/`
- a shared backend in `backend/`
- a separate Maestro extension service in `extensions/maestro-tgk/`

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
- a separate profile-oriented Maestro Data IO writeback service

## Runtime Model

- Frontends are static.
- Demo data persists in SQLite.
- Seeding is explicit, not part of normal page load.
- Docusign is connected per app, not per browser.
- Docusign consent state is stateless and HMAC-signed on the backend.

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

Optional:

- `DOCUSIGN_STATE_SECRET` if you want a separate secret for signing the consent state

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

6. Start the Maestro extension service when you want DocuSign Data IO writeback.

```bash
npm run start:maestro-extension
```

Local extension service:

- [http://localhost:3300/health](http://localhost:3300/health)
- [http://localhost:3300/manifest/clientCredentials.ReadWriteManifest.json](http://localhost:3300/manifest/clientCredentials.ReadWriteManifest.json)

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

## Maestro Extension Model

The extension service in `extensions/maestro-tgk/` is intentionally narrow:

- separate service
- no direct database access
- fake client-credentials auth for private demo use
- Data IO `CreateRecord` and `PatchRecord` map to TGK profile create/update
- TGK remains the system of record through `/api/data/profiles`

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
