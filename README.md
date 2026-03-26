# TGK Demo Platform

Small DocuSign demo platform for SE workflows.

## Structure

- `frontends/`: static portals
- `backend/`: shared API, SQLite, DocuSign auth, envelopes, webhooks
- `extensions/maestro-tgk/`: separate Maestro Data IO writeback service

Seeded demo:

- advisor: `frontends/tgk-wealth/advisor/index.html`
- investor: `frontends/tgk-wealth/investor/index.html`

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

- frontends stay static
- SQLite is the demo store
- DocuSign is connected per app, not per browser
- frontend config is generated into `frontends/tgk-wealth/runtime-config.js`
- `npm run build:frontend-config` is only for deploy-time frontend config, not normal local dev
- `npm run start:frontend` is only a convenience server for hosts that want a normal web service

## Deploy Notes

Recommended shape:

- one frontend host
- one backend service
- one Maestro service
- one persistent volume for the backend SQLite file

Useful envs:

- backend: `TGK_DB_PATH`
- frontend: `TGK_FRONTEND_BACKEND_URL`
- Maestro: `TGK_BACKEND_URL`

Keep these out of git:

- `backend/.env`
- `extensions/maestro-tgk/.env`

## API

Main areas:

- `/api/apps/*`
- `/api/auth/*`
- `/api/data/*`
- `/api/envelopes/*`
- `/api/webhooks/*`
- `/api/proxy/*`

Docs are served by the backend at `/api-docs`.
