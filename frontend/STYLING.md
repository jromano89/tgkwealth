# Styling

This frontend is not Tailwind.

The styling layers are:
- `frontend/shared/styles/tgk-brand.css`: fonts, tokens, and base resets
- `frontend/shared/styles/tgk-ui.css`: semantic `tgk-*` layout and component styles
- `frontend/shared/styles/tgk-launcher.css`: launcher-only page styling

Rules:
- Keep base styles in `tgk-brand.css`.
- Keep launcher-specific styles in `tgk-launcher.css`; do not treat it as a shared UI layer.
- If a UI needs custom behavior, add semantic `tgk-*` classes in `tgk-ui.css`.
- Prefer editing existing `tgk-*` patterns over inventing Tailwind-shaped classes.
