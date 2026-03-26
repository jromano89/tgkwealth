# TGK Demo Platform

Reusable Docusign Intelligent Agreement Management (IAM) demo platform for Solution Consultants at Docusign.

## Design Decisions

- **Backend is generic and shared.** App-scoped by slug, not hardcoded to any vertical. One deployed instance serves multiple frontends. Currently live at `https://backend-tgk.up.railway.app/`.
- **Frontends are static HTML.** Alpine.js + Tailwind, no build step. Deployable anywhere that serves files.
- **CORS is fully open.** Intentional — any frontend origin needs to reach the backend. This is a demo platform, not a production service.
- **SQLite, not Postgres.** Simplicity over scale. Demo data is small and ephemeral.
- **No auth on the backend API.** Demo-only. App isolation is by slug, not by access control.
- **Maestro extension is optional.** Only needed for realistic end-to-end Maestro Data IO workflows. 

## Structure

- `frontends/`: static portals (one directory per vertical)
- `backend/`: shared API — SQLite, Docusign auth, envelopes, webhooks, CORS proxy
- `extensions/maestro-tgk/`: optional Maestro Data IO writeback service

Current demo: `tgk-wealth` (FINS wealth management — advisor + investor portals).

## Building a New Frontend

To add a demo for another vertical:

1. Create a new directory under `frontends/` (e.g. `frontends/hls-claims/`)
2. Pick an app slug (e.g. `hls-claims`)
3. Point your frontend at the shared backend
4. Seed demo data via `/api/apps/bootstrap`
5. Use the existing API contract — no backend changes needed

The `tgk-wealth` frontend is a reference implementation.

## Local Run

1. Install backend deps and create `backend/.env`.

```bash
cd backend
cp .env.example .env
npm install
cd ..
```

Required backend envs:

- `Docusign_INTEGRATION_KEY`
- `Docusign_RSA_PRIVATE_KEY`
- `Docusign_SECRET_KEY`

2. Start the backend.

```bash
npm run dev:backend
```

3. Seed the demo once.

```bash
npm run seed:tgk
```

4. Serve `frontends/` statically.

```bash
python3 -m http.server 5500 --directory frontends
```

5. Start the Maestro service only when needed.

```bash
npm run start:maestro-extension
```

Local URLs:

- backend: [http://localhost:3000](http://localhost:3000)
- API docs: [http://localhost:3000/api-docs](http://localhost:3000/api-docs)
- advisor: [http://localhost:5500/tgk-wealth/advisor/](http://localhost:5500/tgk-wealth/advisor/)
- investor: [http://localhost:5500/tgk-wealth/investor/](http://localhost:5500/tgk-wealth/investor/)
- Maestro health: [http://localhost:3300/health](http://localhost:3300/health)

## Runtime Notes

- Frontends stay static — no server-side rendering
- SQLite is the demo store
- Docusign is connected per app, not per browser
- Frontend config is generated into `frontends/<vertical>/runtime-config.js`
- `npm run build:frontend-config` is only for deploy-time config, not local dev
- `npm run start:frontend` is a convenience server for hosts that want a normal web service

## Deploy Notes

Recommended shape:

- one frontend host (static)
- one backend service (currently Railway)
- one Maestro service (optional)
- one persistent volume for SQLite

Useful envs:

- backend: `TGK_DB_PATH`
- frontend: `TGK_FRONTEND_BACKEND_URL`
- Maestro: `TGK_BACKEND_URL`

Keep out of git:

- `backend/.env`

## API

- `/api/apps/*` — app bootstrap and state
- `/api/auth/*` — Docusign OAuth/JWT
- `/api/data/*` — profiles and records (app-scoped)
- `/api/envelopes/*` — envelope tracking
- `/api/webhooks/*` — Docusign Connect
- `/api/proxy/*` — generic CORS pass-through

Docs served at `/api-docs`.