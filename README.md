# TGK Demo Platform

Static frontend plus reusable Express/SQLite backend.

The frontend has no build step or package metadata. It is plain HTML/CSS/JS served by the tiny Node server in `frontend/server.js` for Railway compatibility. If you host it elsewhere, serve `frontend/` as static files.

## Structure

- `frontend/`: static advisor/investor demo
- `backend/`: reusable backend, Maestro bridge, architecture page
- `frontend/config.js`: frontend config + mode gate
- `scripts/seed-demo-api.js`: optional seed script

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
node server.js
```

Optional: load the demo dataset.

```bash
node scripts/seed-demo-api.js
```

Useful URLs:

- `http://localhost:8080/`
- `http://localhost:8080/advisor/`
- `http://localhost:8080/investor/`
- `http://localhost:3000/`
- `http://localhost:3000/api/health`
- `http://localhost:3000/architecture/`
- `http://localhost:3000/maestro/health`

## Notes

- `advanced` is the default mode.
- `normal` mode uses default branding and hides Settings + IAM Products.
- Workflow IDs, backend URLs, and DocuSign `userId` / `accountId` / `scopes` live in `frontend/config.js`.
- The backend-hosted DocuSign consent callback is fixed at `/api/auth/callback`, so frontend hosting changes do not require new redirect URIs in DocuSign.
- The frontend fetches DocuSign access tokens from `POST /api/auth/token` and caches them locally; DocuSign API calls still go through `POST /api/proxy`.

## Deployment

- Frontend service: run `node server.js` in `frontend/`
- Backend service: run `npm start` in `backend/`
- Keep a persistent volume for `backend/data/`, or override `TGK_DB_PATH`
