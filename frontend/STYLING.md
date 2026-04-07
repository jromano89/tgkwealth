# Styling

This frontend is not Tailwind.

The styling layers are:
- `frontend/shared/styles/tgk-brand.css`: fonts and brand tokens
- `frontend/shared/styles/tgk-utilities.css`: shared resets and base tokens
- `frontend/shared/styles/tgk-ui.css`: semantic `tgk-*` layout and component styles

Rules:
- Treat `tgk-utilities.css` as base infrastructure, not a utility playground.
- If a UI needs custom behavior, add semantic `tgk-*` classes in `tgk-ui.css`.
- Prefer editing existing `tgk-*` patterns over inventing Tailwind-shaped classes.
