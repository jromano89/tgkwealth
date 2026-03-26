# TGK Maestro Extension

Small DocuSign Maestro Data IO service for TGK.

## Purpose

- separate service
- fake client-credentials auth for demo use
- writes to the TGK backend API, not SQLite
- creates and updates TGK profiles

Canonical Data IO type:

- `Profile`

Compatibility alias:

- `Investor`

## Run

```bash
npm --prefix extensions/maestro-tgk run start
```

Local URLs:

- service: `http://localhost:3300`
- health: `http://localhost:3300/health`
- manifest: `http://localhost:3300/manifest/clientCredentials.ReadWriteManifest.json`

## Contract

- `CreateRecord` -> create profile
- `PatchRecord` -> update profile
- `SearchRecords`, `GetTypeNames`, `GetTypeDefinitions` are included for Data IO completeness

Useful fields:

- `DisplayName`
- `Email`
- `Phone`
- `Organization`
- `Status`
- `Source`
- `DataJson`
- `Aum`
- `NetWorth`
- `LifecycleStage`
- `CompletedEnvelopeId`

Returned `recordId` is the TGK profile id.
