# Story Sandbox

`frontend/scenes` is now a narrow sandbox for one reference-style story demo:

- a five-scene top rail
- a shared Docusign-inspired vignette banner
- two editable HTML scenes
- two live advisor embeds
- one live embedded DocuSign signing scene

This is intentionally no longer a generic scene framework.

## Run

From the repo root:

```bash
cd frontend
npm start
```

Open:

- `http://localhost:8080/scenes/`
- `http://localhost:8080/scenes/wealth/account-onboarding/`

## Structure

```text
frontend/scenes/
  index.html
  README.md
  shared/
    scene-runner.css
    scene-runner.js
  wealth/
    account-onboarding/
      index.html
      manifest.json
      partials/
        scene-1.html
        scene-5.html
```

## Editing

- Update scene labels, vignette copy, and embed routes in `wealth/account-onboarding/manifest.json`.
- Edit the framed intro/outro content in `wealth/account-onboarding/partials/scene-1.html` and `wealth/account-onboarding/partials/scene-5.html`.
- Keep changes inside `frontend/scenes` unless you explicitly want to alter the underlying advisor app.
