# TGK Maestro Extension

Optional DocuSign Maestro Data IO service for TGK. Enables realistic end-to-end Maestro workflows without demo magic.

## Design

- Separate service — does not touch SQLite directly
- Writes to the TGK backend API (`/api/data/contacts`)
- Fake client-credentials auth (private demo use only)
- TGK-specific for now; harder to share across verticals than the backend

## Data IO Contract

Canonical type: `Contact` (aliases: `Investor`, `Profile`)

- `CreateRecord` -> create contact
- `PatchRecord` -> update contact
- `SearchRecords`, `GetTypeNames`, `GetTypeDefinitions` included for Data IO completeness

Returned `recordId` is the TGK contact id.

## Run

```bash
npm --prefix extensions/maestro-tgk run start
```

Local URLs:

- service: `http://localhost:3300`
- health: `http://localhost:3300/health`
- manifest: `http://localhost:3300/manifest/clientCredentials.ReadWriteManifest.json`
