# Customization Baseline

This repository is a local customization baseline copied from CodexScope v0.1.7.

## Scope

- Keep the local data generator behavior unchanged for the first UI pass.
- Start UI changes in `index.html`, `styles.css`, and `app.ts`.
- Build `app.js` from `app.ts`; do not hand-edit `app.js`.
- Keep `LICENSE` because the upstream project is MIT licensed.

## Privacy Guardrails

- Do not commit `data.js`, `.codexscope-cache.json`, or generated release binaries.
- Treat screenshots and exported dashboard data as potentially private.
- The optional CNY conversion currently calls Frankfurter for a display-only exchange rate.
