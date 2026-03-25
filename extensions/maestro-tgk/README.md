# TGK Maestro Extension

Profile-oriented DocuSign Maestro Data IO extension service for the TGK demo.

It is intentionally small:

- separate service
- no runtime dependencies beyond Node
- fake client-credentials auth for private demo use
- writes to the existing TGK backend API instead of touching SQLite directly

## What It Does

- `CreateRecord` creates a TGK profile
- `PatchRecord` updates a TGK profile
- `SearchRecords`, `GetTypeNames`, and `GetTypeDefinitions` are included so the app behaves like a complete Data IO extension

The canonical type is `Profile`. `Investor` is still accepted as a compatibility alias.

## Run It

1. Copy `.env.example` to `.env` if you want to override defaults.
2. Start the TGK backend first.
3. Start the extension service:

```bash
npm --prefix extensions/maestro-tgk run start
```

Default local URLs:

- service: `http://localhost:3300`
- health: `http://localhost:3300/health`
- hosted manifest JSON: `http://localhost:3300/manifest/clientCredentials.ReadWriteManifest.json`

## Maestro / Data IO Contract

Use `typeName: "Profile"` for new actions.

Supported profile fields:

- `Id`
- `Ref`
- `Kind`
- `DisplayName`
- `FullName`
- `FirstName`
- `LastName`
- `Email`
- `Phone`
- `Organization`
- `Status`
- `Source`
- `DataJson`
- `Aum`
- `NetWorth`
- `RiskProfile`
- `Role`
- `AssignedTo`
- `LifecycleStage`
- `CompletedEnvelopeId`

Create defaults:

- `status` defaults to `pending`
- `Aum` defaults to `0`
- `NetWorth` defaults to `0`
- filler demo fields like advisor, avatar color, and risk profile are backfilled if omitted

The returned `recordId` is the TGK profile id. Pass that into `PatchRecord` when the workflow needs to update the same profile later.
