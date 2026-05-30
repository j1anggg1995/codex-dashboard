# Contributing

Thanks for considering a contribution to codex-dashboard.

The project is intentionally small and local-first. Good contributions improve usage visibility, privacy, setup clarity, or platform reliability without making the tool harder to run.

## Local Setup

```bash
npm install
npm start
```

Open:

```text
http://127.0.0.1:4174/index.html
```

For frontend checks:

```bash
npm run build:frontend
npm run verify
```

For the Go data generator:

```bash
go test ./...
```

## Contribution Guidelines

- Keep local data local.
- Do not commit real `data.js`, logs, `.env` files, or session exports.
- Prefer sample or redacted data in screenshots and issue reports.
- Keep setup steps simple for non-technical users.
- Avoid broad rewrites unless they solve a concrete maintenance problem.

## Useful Areas

- Better privacy controls and redaction.
- macOS and Windows setup screenshots.
- Clearer sample data.
- More robust parsing of Codex session logs.
- Release package improvements.

## Pull Request Checklist

- [ ] The change does not commit private local data.
- [ ] `npm run build:frontend` passes when frontend files change.
- [ ] `go test ./...` passes when generator files change.
- [ ] README or docs are updated when setup behavior changes.
