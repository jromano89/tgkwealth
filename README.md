# TGK Demo Platform

Reusable Docusign Intelligent Agreement Management demo platform for Solution Consultants at Docusign.

## Core Ideas

- The backend is shared and app-scoped by slug. One deployed service can support multiple static frontends.
- Frontends are static HTML with Alpine.js and Tailwind. There is no build step.
- The Maestro extension is optional and only needed for realistic writeback demos.
- This is a demo platform, not a production service. Open CORS, SQLite, and simplified auth are intentional trade-offs.

Current seeded demo: `tgk-wealth` (advisor + investor portals).

## Architecture

- `backend/src/routes/`: HTTP entrypoints only. Route files should stay thin.
- `backend/src/repositories/app-data-store.js`: app-scoped SQLite access for profiles, records, envelopes, and tasks.
- `backend/src/services/app-data-service.js`: business rules for app data CRUD and tracked envelope updates.
- `backend/src/services/app-bootstrap-service.js`: bootstrap/reset flow for seeded demo data.
- `frontends/shared/js/api-client.js`: shared frontend HTTP client.
- `frontends/shared/js/settings-panel.js`: shared settings state and theme persistence.
- `frontends/shared/js/shared-ui.js`: shared settings layout and envelope modal UI.
- `extensions/maestro-tgk/src/backend-client.js`: TGK backend client for the Maestro extension.

## Data Model

Current SQLite tables:

- `apps`
- `docusign_connections`
- `profiles`
- `records`
- `envelopes`
- `tasks`
- `webhook_events`

`profiles` and `records` are still the public demo API names because the current seed data, portals, and Maestro writeback contract already depend on them.

For future vertical-agnostic growth, treat them conceptually as:

- `profiles`: the primary entity surfaced in the UI. Today that is an investor, but it could also map to a claimant, employee, patient, partner, or case owner.
- `records`: related business objects attached to the primary entity. Today that is an account, but it could also map to a policy, claim, application, workspace, or intake packet.

Recommendation:

- Keep `profiles` and `records` in the current API until there is a real need for a breaking change.
- If the platform expands across more verticals, introduce a v2 compatibility layer with more neutral names such as `entities` and `resources` instead of renaming the live schema in place.

## Repository Structure

- `frontends/`: static demo portals
- `frontends/shared/`: shared scripts, styles, and UI templates
- `backend/`: shared demo API and SQLite store
- `extensions/maestro-tgk/`: optional Maestro Data IO service
- `scripts/`: local utilities for seeding and runtime config generation

## Build a New Frontend

To add another demo:

1. Create a new directory under `frontends/`.
2. Pick an app slug.
3. Point the frontend at the shared backend.
4. Seed demo data with `/api/apps/bootstrap`.
5. Reuse the existing API contract before changing backend code.

Use `frontends/tgk-wealth/` as the reference implementation.

## Local Run

1. Install backend deps and create `backend/.env`.

```bash
cd backend
cp .env.example .env
npm install
cd ..
```

Required backend envs:

- `DOCUSIGN_INTEGRATION_KEY`
- `DOCUSIGN_RSA_PRIVATE_KEY`
- `DOCUSIGN_SECRET_KEY`

2. Start the backend.

```bash
npm run dev:backend
```

3. Seed the demo once.

```bash
npm run seed:tgk
```

4. Serve `frontends/`.

```bash
npm run start:frontend
```

5. Start the Maestro service only when needed.

```bash
npm run start:maestro-extension
```

6. Run the shared JavaScript syntax check when you change backend, frontend, or extension code.

```bash
npm run check
```

Local URLs:

- backend: [http://localhost:3000](http://localhost:3000)
- API docs: [http://localhost:3000/api-docs](http://localhost:3000/api-docs)
- advisor: [http://localhost:5500/tgk-wealth/advisor/](http://localhost:5500/tgk-wealth/advisor/)
- investor: [http://localhost:5500/tgk-wealth/investor/](http://localhost:5500/tgk-wealth/investor/)
- Maestro health: [http://localhost:3300/health](http://localhost:3300/health)

## Runtime Notes

- Frontends stay static.
- Docusign is connected per app, not per browser.
- Runtime frontend config is generated into `frontends/<vertical>/runtime-config.js`.
- `npm run build:frontend-config` is for deploy-time config generation.
- SQLite is the demo store, and the backend creates the schema on startup.

## Deploy Notes

Recommended shape:

- one static frontend host
- one backend service
- one Maestro service when needed
- one persistent volume for SQLite

Useful envs:

- backend: `TGK_DB_PATH`
- frontend: `TGK_FRONTEND_BACKEND_URL`
- Maestro: `TGK_BACKEND_URL`

Keep out of git:

- `backend/.env`

## API Summary

- `/api/apps/*` — app bootstrap and state
- `/api/auth/*` — Docusign OAuth/JWT
- `/api/data/*` — profiles, records, tracked envelopes, and tasks
- `/api/envelopes/*` — live envelope actions and Docusign-backed document endpoints
- `/api/webhooks/*` — Docusign Connect
- `/api/proxy/*` — generic CORS pass-through

Docs are served at `/api-docs`.
