# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
npm install

# Run the TUI application
npm start

# Run in watch/dev mode (auto-reloads on file changes)
npm run dev

# View live logs
tail -f logs/application-*.log
tail -f logs/error-*.log

# Clear task state
rm data/tasks.json

# Check Redis is running
redis-cli ping
```

No test suite is configured (`npm test` exits with an error).

## Architecture

This is a Node.js CLI tool that migrates indices from Elasticsearch 5 to Elasticsearch 9. The UI is built with [Ink](https://github.com/vadimdemedes/ink) (React for terminal), and background jobs run via [Bull](https://github.com/OptimalBits/bull) queues backed by Redis.

### Application flow

`src/cli/index.jsx` renders the root `App` component, which manages a `screen` state machine: `loading → home → wizard | monitor`. On startup it initializes the LowDB database, tests Redis, and starts the Bull queue processor before showing the home screen.

- **Home** (`TaskList`) — lists existing migration tasks persisted in `data/tasks.json`
- **Wizard** (`wizard.jsx` + components) — multi-step form to collect source/dest ES config, select an index, and pick a control field (a sortable numeric/date field used as a migration checkpoint)
- **Monitor** (`ProgressMonitor`) — polls `getTaskStatus()` every 2 s and shows live progress; accepts P/R/C keyboard controls

### Core layers

| Path | Responsibility |
|------|----------------|
| `src/core/elasticsearch/client.js` | Creates `@elastic/elasticsearch` v8 clients (supports SSL/auth for both ES5 legacy and ES9) |
| `src/core/elasticsearch/legacyClient.js` | HTTP client for ES5 (v8 SDK can still talk to ES5 in compatibility mode) |
| `src/core/elasticsearch/indexManager.js` | `getIndexMapping`, `getIndexSettings`, `createIndex`, `getDocumentCount`, `indexExists` |
| `src/core/elasticsearch/bulkOperations.js` | `bulkIndex` (bulk write to dest) and `getFieldRange` (min/max of control field) |
| `src/core/migration/mappingConverter.js` | Converts ES5 mappings to ES9 (e.g. `string` → `text`/`keyword`, removes `_all`, `_timestamp`, `include_in_all`) |
| `src/core/migration/analyzerConverter.js` | Converts deprecated ES5 analyzers/filters to ES9 equivalents |
| `src/core/migration/migrationEngine.js` | Orchestrates migration: convert mapping → create dest index → scroll source → bulk index dest, reporting progress via callback |
| `src/core/tasks/taskManager.js` | CRUD for task records, delegates execution to the Bull queue |
| `src/core/tasks/queue.js` | Bull queue processor; calls `performMigration` from the engine |
| `src/core/cache/redisClient.js` | ioredis connection singleton |
| `src/core/cache/cacheStrategy.js` | Caches index mappings/settings in Redis to avoid repeated ES calls |
| `src/database/db.js` | LowDB (JSON file) persistence at `data/tasks.json` |
| `src/utils/config.js` | Reads `.env` via dotenv; exposes typed config object |
| `src/utils/logger.js` | Winston logger with daily-rotate-file transport; logs to `logs/` |
| `src/utils/validators.js` | Zod schemas for validating user input from the wizard |

### Key design decisions

- **ES client**: The `@elastic/elasticsearch` v8 SDK is used for both source (ES5) and destination (ES9). ES5 compatibility requires disabling strict version checks — see `client.js`.
- **Control field**: A sortable field (numeric or date) used as a scroll cursor/checkpoint. If the migration is paused and resumed, `resumeMigration` in `migrationEngine.js` is supposed to filter `controlField > lastControlValue`, though the current implementation falls back to a full re-scan.
- **Worker threads**: `config.migration.workerThreads` is read but the engine currently runs single-threaded (`migrateDocuments`). The multi-worker split is noted as a future improvement in the code.
- **Persistence**: Task state is stored in `data/tasks.json` via LowDB. Deleting this file resets all task history.

## Prerequisites

- Node.js >= 18
- Redis (must be running before `npm start`)
- Source ES 5.x and destination ES 9.x reachable

Copy `.env.example` to `.env` and set at minimum `ES_SOURCE_URL`, `ES_DEST_URL`, and `REDIS_HOST`.
