# CLAUDE.md

## What This Is

Reusable Docusign IAM demo platform for Solution Consultants (SCs) at Docusign. The backend is generic, shared, and already deployed. SCs only need to build a static frontend against the existing API.

The seeded demo is `tgk-wealth` (FINS wealth management). 

## Key Context

- This is a **demo platform**, not a production service. Intentional trade-offs include open CORS, no auth on the API, SQLite over Postgres, and hardcoded OAuth credentials in the Maestro extension.
- The backend is currently deployed at `https://backend-tgk.up.railway.app/`.
- Frontends are static HTML (Alpine.js + Tailwind, no build step). Deployable on any free static host.
- The Maestro extension is optional and TGK-specific. Only needed for end-to-end Maestro Data IO demos.
- SCs who previously built full-stack apps from scratch on Replit can reuse the backend of this project and deploy lighter weight frontends with any AI tooling.

## Working in This Codebase

- Backend routes are app-scoped by slug (via `X-Demo-App` header or `?app=` query param).
- `backend/src/repositories/app-data-store.js` owns the app-scoped SQLite queries for profiles, records, tasks, and tracked envelopes.
- `backend/src/services/app-data-service.js` and `backend/src/services/app-bootstrap-service.js` own business rules; route files should stay thin.
- `backend/src/utils.js` has shared app/Docusign helpers — check there before writing new utilities.
- Frontend config flows through `runtime-config.js` -> portal `config.js` -> `window.TGK_CONFIG`.
- `frontends/shared/js/api-client.js` is the frontend's HTTP layer — all backend calls go through `TGK_API`.
- `frontends/shared/js/settings-panel.js` owns shared settings state and theme persistence.
- `frontends/shared/js/shared-ui.js` owns shared settings layout and envelope modal UI.
- Swagger docs are inline JSDoc in route files, served at `/api-docs`.

## Commands

- `npm run dev:backend` — start backend with hot reload
- `npm run seed:tgk` — seed TGK demo data (run once)
- `npm run seed:tgk -- --force` — force reseed
- `npm run start:maestro-extension` — start Maestro service
- `npm run build:frontend-config` — generate runtime config (deploy-time only)
