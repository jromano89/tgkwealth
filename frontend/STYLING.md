# Styling

This frontend is not Tailwind.

The styling layers are:
- `frontend/shared/styles/tgk-brand.css`: fonts and brand tokens
- `frontend/shared/styles/tgk-utilities.css`: small shared utility subset
- `frontend/shared/styles/tgk-ui.css`: semantic `tgk-*` layout and component styles

Rules:
- Treat `tgk-utilities.css` as a finite API, not an open-ended utility generator.
- Before using a utility class, verify it exists locally.
- If a UI needs custom behavior or more than a few utility classes, add semantic `tgk-*` classes in `tgk-ui.css`.
- Prefer editing existing `tgk-*` patterns over inventing Tailwind-shaped classes.

Workflow:
1. Inspect the existing CSS first.
2. Make the UI change.
3. Run `node scripts/report-classes.js`.
4. If the change is visual, verify it in a browser render.

Strict mode fails when unresolved static classes remain:

```bash
node scripts/report-classes.js --strict
```
