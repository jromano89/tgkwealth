# TGK Demo Platform

TGK Wealth demo platform for DocuSign IAM and Maestro workflows.

The intent is to keep the demo frontends simple and static while reusing one lightweight backend for auth, proxying, local persistence, and Maestro bridge behavior.

The frontend has no build step. It is plain HTML, CSS, and JS, served by the small Node server in `frontend/server.js` so it can run cleanly on Railway or any other simple Node host.

## Structure

- `frontend/`: launcher plus advisor and investor demo portals
- `backend/`: Express/SQLite API, DocuSign auth/proxy, Maestro bridge, architecture page
- `frontend/config.js`: frontend config, workflow IDs, mode gate, and DocuSign settings
- `scripts/seed-demo-api.js`: optional demo data loader

## Local

1. Create `backend/.env`.

```bash
cp backend/.env.example backend/.env
```

2. Start the backend.

```bash
cd backend
npm install
npm run dev
```

3. Start the frontend in another terminal.

```bash
cd frontend
npm start
```

4. Optionally seed demo data from the repo root.

```bash
node scripts/seed-demo-api.js
```

Useful local URLs:

- `http://localhost:8080/`
- `http://localhost:8080/advisor/`
- `http://localhost:8080/investor/`
- `http://localhost:3000/api/health`
- `http://localhost:3000/architecture/`

## Notes

- `advanced` is the default frontend mode.
- `normal` mode keeps default branding and hides Settings and IAM Products.
- Frontend runtime config lives in `frontend/config.js`.
- The backend-hosted DocuSign consent callback is fixed at `/api/auth/callback`.
- The frontend gets DocuSign access tokens from `POST /api/auth/token` and sends downstream API calls through `POST /api/proxy`.

## Deployment

- Frontend service: run `npm start` in `frontend/`
- Backend service: run `npm start` in `backend/`
- Persist `backend/data/`, or override `TGK_DB_PATH`
