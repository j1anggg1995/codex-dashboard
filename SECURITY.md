# Security Policy

codex-dashboard is a local-first utility that reads Codex session logs from the user's own machine. Security and privacy issues are treated as high priority because local usage exports can contain project names, session identifiers, timing information, quota state, and workflow patterns.

## Supported Versions

The current public release is:

- `v0.1.0`

Security fixes will target the latest release and the `main` branch.

## Sensitive Data Expectations

Do not publish real local usage exports in issues, pull requests, screenshots, or bug reports.

The following files are local-only and should not be committed:

- `data.js`
- `.codexscope-cache.json`
- `.codexscope-server.log`
- `.codexscope-server.pid`
- `.env`

The repository includes `data.sample.js` for demos and testing.

## Reporting a Vulnerability

If you find a privacy or security issue, please open a GitHub issue with a minimal description and avoid including private logs or secrets. If sensitive details are required, describe the class of issue first so we can coordinate a safer disclosure path.

Useful reports include:

- What data may be exposed.
- Whether exposure happens through generated files, screenshots, release packages, or UI rendering.
- The smallest reproduction using sample or redacted data.
- The affected platform and command used.

## Maintainer Review Checklist

Before release, maintainers should verify:

- Local-only files are still ignored by Git.
- Release packages do not include real `data.js` content.
- Screenshots use sample data only.
- New UI surfaces do not reveal private project or session names when privacy mode is enabled.
