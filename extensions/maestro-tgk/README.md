# TGK Maestro Extension

Optional DocuSign Maestro Data IO service for TGK. Enables realistic end-to-end Maestro workflows without demo magic.

## Design

- Separate service — does not touch SQLite directly
- Writes to the TGK backend API (`/api/data/profiles`)
- Fake client-credentials auth (private demo use only)
- TGK-specific for now; harder to share across verticals than the backend

## Data IO Contract

Canonical type: `Profile` (alias: `Investor`)

- `CreateRecord` -> create profile
- `PatchRecord` -> update profile
- `SearchRecords`, `GetTypeNames`, `GetTypeDefinitions` included for Data IO completeness

Returned `recordId` is the TGK profile id.

## Run

```bash
npm --prefix extensions/maestro-tgk run start
```

Local URLs:

- service: `http://localhost:3300`
- health: `http://localhost:3300/health`
- manifest: `http://localhost:3300/manifest/clientCredentials.ReadWriteManifest.json`
