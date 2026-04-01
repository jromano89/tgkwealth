# TGK Demo Platform

Reusable Docusign Intelligent Agreement Management demo platform for Solution Consultants at Docusign.

## Core Ideas

- The backend is shared and app-scoped by slug. One deployed service can support multiple static frontends.
- Frontends are static HTML with Alpine.js plus project-owned utility and component CSS. There is no build step.
- The Maestro extension is optional and only needed for realistic writeback demos.
- This is a demo platform, not a production service. Open cross-origin access, SQLite, and simplified auth are intentional trade-offs.

Current reference demo: `tgk-wealth` (advisor + investor portals).

## Architecture

- `backend/src/routes/`: HTTP entrypoints only. Route files should stay thin.
- `backend/src/database.js`: SQLite schema setup plus targeted legacy migrations.
- `backend/src/data-store.js`: app-scoped SQLite access for employees, customers, envelopes, and tasks.
- `backend/src/services/app-data-service.js`: business rules for app data CRUD and tracked envelope updates.
- `frontends/shared/js/api-client.js`: shared frontend HTTP client.
- `frontends/shared/js/settings-panel.js`: shared settings state and theme persistence.
- `frontends/shared/js/shared-ui.js`: shared settings layout and envelope modal UI.
- `extensions/maestro-tgk/src/backend-client.js`: TGK backend client for the Maestro extension.

## Data Model

Current SQLite tables:

- `apps`
- `employees`
- `customers`
- `envelopes`
- `tasks`

Canonical model:

- `employees`: internal operators such as advisors.
- `customers`: external people or organizations associated to an employee. Frontend-specific account data lives inside `customers.data.accounts`.
- `tasks`: first-class app-scoped work items linked optionally to an employee and/or customer.
- `envelopes`: tracked Docusign envelopes linked optionally to an employee and/or customer.

The backend does not auto-seed app data. Use `/api/data/*`, the Maestro extension, or `scripts/seed-demo-api.js` when you want demo employees, customers, tasks, and envelopes.

## Repository Structure

- `frontends/`: static demo portals
- `frontends/shared/`: shared scripts, styles, and UI templates
- `backend/`: shared demo API and SQLite store
- `extensions/maestro-tgk/`: optional Maestro Data IO service
- `scripts/`: local utilities for runtime config generation and static serving

## Build a New Frontend

To add another demo:

1. Create a new directory under `frontends/`.
2. Pick an app slug.
3. Point the frontend at the shared backend.
4. Create employees and customers through `/api/data/*` or Maestro Data IO, then add tasks and envelopes as needed.
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

No session secret or cookie config is required. The backend is stateless.

2. Start the backend.

```bash
npm run dev:backend
```

3. Serve `frontends/`.

```bash
npm run start:frontend
```

4. Start the Maestro service only when needed.

```bash
npm run start:maestro-extension
```

5. Run the shared JavaScript syntax check when you change backend, frontend, or extension code.

```bash
npm run check
```

Local URLs:

- backend: [http://localhost:3000](http://localhost:3000)
- advisor: [http://localhost:5500/tgk-wealth/advisor/](http://localhost:5500/tgk-wealth/advisor/)
- investor: [http://localhost:5500/tgk-wealth/investor/](http://localhost:5500/tgk-wealth/investor/)
- Maestro health: [http://localhost:3300/health](http://localhost:3300/health)

## Runtime Notes

- Frontends stay static.
- Docusign is connected per app, not per browser.
- The backend does not use cookie sessions.
- Runtime frontend config is generated into `frontends/<vertical>/runtime-config.js`.
- `npm run build:frontend-config` is for deploy-time config generation.
- SQLite is the demo store, and the backend applies the current lean CRM schema plus a small set of targeted legacy migrations on startup.

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

- `/api/auth/*` — Docusign OAuth/JWT
- `/api/data/*` — employees, customers, envelopes, and tasks
- `/api/envelopes/*` — Docusign-backed audit history and combined document downloads
- `/api/webhooks/*` — Docusign Connect sink (discard-only)
- `/api/proxy` — generic POST-based CORS pass-through

## Creating Customers

Use the existing API instead of a backend seed step.

```bash
curl --request POST 'http://localhost:3000/api/data/customers' \
  --header 'X-Demo-App: tgk-wealth' \
  --header 'Content-Type: application/json' \
  --data '{
    "displayName": "Casey Investor",
    "email": "casey@example.com",
    "phone": "(555) 555-0112",
    "organization": "Northwind Family Office",
    "data": {
      "firstName": "Casey",
      "lastName": "Investor",
      "contactType": "investor",
      "riskProfile": "Balanced",
      "value": 1250000,
      "netWorth": 3800000,
      "accounts": [
        {
          "name": "Individual Brokerage",
          "accountType": "Taxable",
          "typeCode": "type-a",
          "value": 1250000,
          "allocEquity": 62,
          "allocFixed": 24,
          "allocAlt": 8,
          "allocCash": 6
        }
      ]
    }
  }'
```
