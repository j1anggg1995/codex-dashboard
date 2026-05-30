# codex-dashboard

Local-first dashboard for Codex usage, quota risk, cost estimates, session analytics, and perceived speed.

[中文说明](README.zh-CN.md) · [Download v0.1.0](https://github.com/j1anggg1995/codex-dashboard/releases/tag/v0.1.0)

![codex-dashboard preview](assets/codex-dashboard-preview.png)

codex-dashboard reads Codex session logs from your own machine and turns them into a local dashboard. It is built for maintainers and heavy Codex users who want to understand where tokens go, which sessions or projects are expensive, whether quota risk is rising, and whether Codex is actually slow or only a few requests are slow.

The tool runs locally. It does not upload session logs to a hosted service.

## What It Shows

- **Usage summary**: total tokens, request count, success rate, cache hit rate, and risk state.
- **Token trends**: input, output, cached, and reasoning token changes over time.
- **Quota and risk**: 5-hour window, weekly quota, failure rate, and usage warnings.
- **Cost estimates**: USD estimates from built-in public pricing, with optional CNY display conversion.
- **Perceived speed**: first-token wait, slow requests, output throughput, and speed score.
- **Rankings**: top projects, sessions, and models by token usage and request count.
- **Privacy mode**: hide project names and session names for screenshots or demos.
- **Light and dark mode**: follows the macOS appearance setting.

## Why This Exists

Codex users often need fast answers to operational questions:

- How many tokens did I use today?
- Which project or model is driving usage?
- Am I close to a quota window limit?
- What is the rough cost profile of my local Codex work?
- Is Codex slow globally, or did one session create the perception?

codex-dashboard makes those questions visible without sending local session data anywhere else.

## Quick Start

Install dependencies:

```bash
npm install
```

Start the local service:

```bash
npm start
```

Open:

```text
http://127.0.0.1:4174/index.html
```

On macOS, you can also double-click:

```text
start-codex-dashboard.command
```

## Release Packages

The v0.1.0 release includes downloadable packages:

- `codex-dashboard-mac.zip`
- `codex-dashboard-windows.zip`

Release packages start a local server and refresh generated data every 60 seconds. Node.js 18 or newer is currently required on the machine.

## Data Source

By default, codex-dashboard reads local Codex session files from:

```text
~/.codex/sessions
```

It extracts usage-oriented metadata such as:

- timestamp
- model
- token counts
- session and project names
- cache hit data
- failure records
- quota window state

## Privacy Model

This is a local utility. The files below may contain real local usage information and are intentionally ignored by Git:

- `data.js`
- `.codexscope-cache.json`
- `.codexscope-server.log`
- `.codexscope-server.pid`
- `.env`

The checked-in `data.sample.js` file contains sample data only.

## Commands

```bash
npm start                 # Start the local service in the background
npm run stop              # Stop the local service
npm run serve             # Run the local service in the current terminal
npm run generate          # Generate data.js manually
npm run build:frontend    # Compile frontend TypeScript
npm run verify            # Build and run responsive UI checks
```

## Project Structure

```text
index.html                         Page entry
app.ts / app.js                     Dashboard logic
styles.css                         Base styles
styles-mac-console.css             macOS visual layer
scripts/generate-codex-data.mjs    Local data generator
scripts/serve-local.mjs            Local refresh service
scripts/start-local.mjs            Background start script
scripts/stop-local.mjs             Stop script
data.sample.js                     Sample data
```

## Notes

- Opening `index.html` directly can preview the UI, but live local data refresh requires the local service.
- GitHub Pages cannot read local Codex logs, so this project is meant to run locally.
- Cost values are estimates from public pricing and local token records. Official billing remains the source of truth.
- CNY is display-only conversion; the underlying estimate is USD.

## Origin

This project is based on [JUk1-GH/CodexScope](https://github.com/JUk1-GH/CodexScope) and has been adapted into a local-first `codex-dashboard` experience.
