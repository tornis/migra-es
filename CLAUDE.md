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

`src/cli/index.jsx` renders the root `App` component, which manages a `screen` state machine: `loading → home → wizard | monitor | ai-config | impact-analysis | breaking-changes-memory`. On startup it initializes the LowDB database, tests Redis, and starts the Bull queue processor before showing the home screen.

- **Home** (`TaskList`) — lists existing migration tasks persisted in `data/tasks.json`; keyboard shortcuts `A` (AI config), `I` (impact analysis), `B` (breaking changes memory) navigate to AI screens
- **Wizard** (`wizard.jsx` + components) — multi-step form to collect source/dest ES config, select an index, and pick a control field; when AI is configured, `handleConfirmMigrations` routes through `proposal-runner → proposal-review` before executing the migration; falls back to direct migration otherwise
- **Monitor** (`ProgressMonitor`) — polls `getTaskStatus()` every 2 s and shows live progress; accepts P/R/C keyboard controls
- **AI Config** (`AIProviderSelector`) — wizard for configuring the AI provider (Claude, OpenAI, Gemini, or custom OpenAI-compatible endpoint); saved to `~/.migra-es/ai-config.json`
- **Impact Analysis** (`ImpactAnalysisView`) — live-streaming per-index AI analysis view
- **Breaking Changes Memory** (`BreakingChangesMemoryView`) — view and manage the persistent cache of AI-generated ES version breaking changes guidance
- **Proposal Runner** (`MigrationProposalRunner`) — sequential per-index AI analysis runner; allows reusing cached proposals or regenerating them
- **Proposal Review** (`MigrationProposalReview`) — approve/reject workflow per index before migration executes
- **Proposal Detail** (`IndexProposalDetail`) — tabbed detail viewer for a single index proposal (Report / Mapping / Settings+Analyzers / Strategy)

### Core layers

| Path | Responsibility |
|------|----------------|
| `src/core/elasticsearch/client.js` | Creates `@elastic/elasticsearch` v8 clients (supports SSL/auth for both ES5 legacy and ES9) |
| `src/core/elasticsearch/legacyClient.js` | HTTP client for ES5 (v8 SDK can still talk to ES5 in compatibility mode) |
| `src/core/elasticsearch/indexManager.js` | `getIndexMapping`, `getIndexSettings`, `createIndex`, `getDocumentCount`, `indexExists` |
| `src/core/elasticsearch/bulkOperations.js` | `bulkIndex` (bulk write to dest) and `getFieldRange` (min/max of control field) |
| `src/core/migration/mappingConverter.js` | Converts ES5 mappings to ES9 (e.g. `string` → `text`/`keyword`, removes `_all`, `_timestamp`, `include_in_all`) |
| `src/core/migration/analyzerConverter.js` | Converts deprecated ES5 analyzers/filters to ES9 equivalents |
| `src/core/migration/migrationEngine.js` | Orchestrates migration: calls `loadProposal()` first; uses AI-proposed mapping/settings/analyzers/template/aliases when available, falls back to auto-converters; scroll source → bulk index dest |
| `src/core/tasks/taskManager.js` | CRUD for task records, delegates execution to the Bull queue |
| `src/core/tasks/queue.js` | Bull queue processor; calls `performMigration` from the engine |
| `src/core/cache/redisClient.js` | ioredis connection singleton |
| `src/core/cache/cacheStrategy.js` | Caches index mappings/settings in Redis to avoid repeated ES calls |
| `src/database/db.js` | LowDB (JSON file) persistence at `data/tasks.json` |
| `src/utils/config.js` | Reads `.env` via dotenv; exposes typed config object |
| `src/utils/logger.js` | Winston logger with daily-rotate-file transport; logs to `logs/` |
| `src/utils/validators.js` | Zod schemas for validating user input from the wizard |

#### AI layer (`src/core/ai/`)

| Path | Responsibility |
|------|----------------|
| `aiConfig.js` | Load/save AI provider config at `~/.migra-es/ai-config.json`; supports `claude`, `openai`, `gemini`, `custom` |
| `aiClient.js` | Factory that instantiates the correct streaming provider from config |
| `providers/claude.js` | Anthropic Claude streaming provider |
| `providers/openai.js` | OpenAI streaming provider with unified interface |
| `providers/gemini.js` | Google Gemini streaming provider |
| `providers/custom.js` | Custom OpenAI-compatible endpoint via raw fetch SSE |
| `breakingChangesMemory.js` | Persistent filesystem cache of AI-generated ES5→9 breaking changes guidance; avoids redundant AI calls across sessions |
| `impactAnalyzer.js` | Two-phase AI analysis pipeline for a single index |
| `indexArtifacts.js` | Filesystem CRUD for per-index proposal artifacts stored at `~/.migra-es/indices/{indexName}/` |
| `migrationProposal.js` | Two-step AI streaming pipeline (breaking changes cache → structured proposal); injects `langInstruction()` from the active i18n locale so reports are generated in the app's configured language |

### Key design decisions

- **ES client**: The `@elastic/elasticsearch` v8 SDK is used for both source (ES5) and destination (ES9). ES5 compatibility requires disabling strict version checks — see `client.js`.
- **Control field**: A sortable field (numeric or date) used as a scroll cursor/checkpoint. If the migration is paused and resumed, `resumeMigration` in `migrationEngine.js` is supposed to filter `controlField > lastControlValue`, though the current implementation falls back to a full re-scan.
- **Worker threads**: `config.migration.workerThreads` is read but the engine currently runs single-threaded (`migrateDocuments`). The multi-worker split is noted as a future improvement in the code.
- **Persistence**: Task state is stored in `data/tasks.json` via LowDB. Deleting this file resets all task history.
- **AI proposals**: When an AI provider is configured, the wizard generates a per-index proposal (mapping, settings, analyzers, template, aliases, and a human-readable report) before migration. Proposals are saved as JSON artifacts under `~/.migra-es/indices/{indexName}/`. The migration engine reads these artifacts at execution time; if no artifact exists it falls back to the auto-converters.
- **Breaking changes cache**: AI-generated ES5→9 breaking changes guidance is cached to disk at `~/.migra-es/breaking-changes-memory.json` and reused across sessions to avoid redundant AI calls. It can be inspected and cleared from the **Breaking Changes Memory** screen.
- **AI report language**: `migrationProposal.js` calls `langInstruction()` from the active i18n locale and injects it into every AI prompt, so all generated reports match the app's configured language (pt-BR or English).
- **AI provider config**: Stored at `~/.migra-es/ai-config.json` (never committed). Supports Claude, OpenAI, Gemini, and any custom OpenAI-compatible endpoint.

## Prerequisites

- Node.js >= 18
- Redis (must be running before `npm start`)
- Source ES 5.x and destination ES 9.x reachable

Copy `.env.example` to `.env` and set at minimum `ES_SOURCE_URL`, `ES_DEST_URL`, and `REDIS_HOST`.
