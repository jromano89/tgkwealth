# TGK Maestro Extension

Optional DocuSign Maestro Data IO service for TGK. Enables realistic end-to-end Maestro workflows without demo magic.

## Design

- Separate service — does not touch SQLite directly
- Writes to the TGK backend API (`/api/data/employees`, `/api/data/customers`, `/api/data/tasks`, `/api/data/envelopes`)
- Registry-driven Data IO types keep the entity wiring thin and consistent
- Fake client-credentials auth (private demo use only)
- TGK-specific for now; harder to share across verticals than the backend

## Data IO Contract

Canonical types:

- `Customer` for customer rows
- `Employee` for advisors/internal operators
- `Task` for app-scoped tasks
- `Envelope` for tracked Docusign envelopes

Supported operations for each type:

- `CreateRecord`
- `PatchRecord`
- `SearchRecords`
- `GetTypeNames`
- `GetTypeDefinitions`

Returned `recordId` is the TGK row id. For `Envelope`, that is the Docusign envelope id. The old `Contact` alias is still accepted as an input synonym for `Customer`.

## Run

```bash
npm --prefix extensions/maestro-tgk run start
```

Local URLs:

- service: `http://localhost:3300`
- health: `http://localhost:3300/health`
- manifest: `http://localhost:3300/manifest/clientCredentials.ReadWriteManifest.json`
