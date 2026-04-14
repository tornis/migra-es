# IndexBridge

> Also available in: [Português (pt-BR)](./README.pt-BR.md)

Terminal UI (TUI) for seamless index migration between Elasticsearch and OpenSearch versions, with AI-powered impact analysis.

---

## Overview

**IndexBridge** is an interactive command-line tool that automates index migration across incompatible versions and between different search platforms (Elasticsearch ↔ OpenSearch). Migrating between ES5 and ES9, or transitioning from Elasticsearch to OpenSearch (and vice versa) involves deep breaking changes in mappings, analyzers, settings, and APIs — IndexBridge handles all of that through a guided step-by-step flow.

When configured with an AI provider (Claude, OpenAI, Gemini, or a compatible endpoint), IndexBridge analyzes each index before migrating it, generates a detailed impact report, and proposes optimized mappings, settings, and analyzers for the target platform and version. The user approves or rejects each proposal before any data is moved.

---

## Features

- **Interactive TUI** — keyboard-navigable terminal interface built with [Ink](https://github.com/vadimdemedes/ink)
- **Scroll + Bull queue migration** — uses the ES5 scroll API with Redis-backed queue processing for high resilience
- **Cross-platform support** — seamlessly migrate between Elasticsearch and OpenSearch, with automatic platform detection
- **Automatic mapping conversion** — converts types across platforms (ES5 `string` → ES9 `text`/`keyword`; `dense_vector` ↔ `knn_vector` for vector search)
- **Analyzer conversion** — adapts deprecated analyzers and token filters to target version equivalents
- **Vector field migration** — intelligent conversion of vector search fields between Elasticsearch dense_vector and OpenSearch knn_vector formats
- **AI-powered impact analysis** — two-phase analysis pipeline per index; reports generated in the configured language (pt-BR or English)
- **Reviewable proposals** — AI-generated mapping, settings, analyzers, template, and aliases are presented for approval before execution
- **Breaking changes cache** — AI-generated breaking changes guide is persisted locally per version pair, avoiding redundant API calls
- **Multi-provider** — supports Claude (Anthropic), OpenAI, Google Gemini, and any OpenAI-compatible endpoint
- **Internationalization** — UI and AI reports available in Portuguese (pt-BR) and English

---

## Prerequisites

- Node.js >= 18
- Redis running locally (or accessible over the network)
- Source: Elasticsearch 5.x / 9.x or OpenSearch 1.x / 2.x / 3.x
- Destination: Elasticsearch 9.x or OpenSearch 1.x / 2.x / 3.x (reachable)

---

## Installation

```bash
git clone <repo>
cd indexbridge
npm install
cp .env.example .env
```

Edit `.env` with the minimum required settings:

```env
ES_SOURCE_URL=http://localhost:9200   # Source: Elasticsearch or OpenSearch
ES_DEST_URL=http://localhost:9201     # Destination: Elasticsearch or OpenSearch
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

**Note:** Platform detection is automatic — the tool detects whether each endpoint is Elasticsearch or OpenSearch and adapts the migration strategy accordingly.

---

## Usage

```bash
# Start the TUI
npm start

# Development mode (auto-reloads on file changes)
npm run dev
```

### Dashboard keyboard shortcuts (Home screen)

| Key | Action |
|-----|--------|
| `N` | New migration (opens the wizard) |
| `A` | Configure AI provider |
| `I` | Impact analysis |
| `B` | Breaking changes cache |
| `Enter` | Open selected task |
| `↑ / ↓` | Navigate task list |

---

## Migration flow with AI analysis

```
Wizard
  └─ Source / destination configuration
  └─ Index selection
  └─ Control field (scroll checkpoint cursor)
  └─ Confirmation
        │
        ├─ [AI configured] → Proposal Runner
        │     └─ Per-index analysis (streaming)
        │     └─ Proposal: mapping + settings + analyzers + report
        │
        ├─ [AI configured] → Proposal Review
        │     └─ Approve or reject per index
        │     └─ Drill-down tabs: Report / Mapping / Settings / Strategy
        │
        └─ Migration Engine
              └─ [with AI]    uses artifacts from the approved proposal
              └─ [without AI] uses auto-converters for mapping/analyzers
              └─ Scroll source → Bulk index destination
```

---

## How the AI analyzes each index

Impact analysis happens in **two phases** per index, before any data is moved.

### Phase 1 — Breaking changes

The `breakingChangesMemory` module checks whether a cached breaking changes guide already exists locally at `~/.migra-es/breaking-changes-memory.json`. Cache keys are namespaced by version pair (e.g., `ES:5→9`, `OS:2→3`, `ES→OS`) to support both intra-version and cross-platform migrations. If not found, it queries the AI model for a structured list of incompatible changes between the two versions/platforms. The result is saved locally and reused in future analyses — avoiding unnecessary API calls.

### Phase 2 — Per-index proposal

With the breaking changes context in hand, the `migrationProposal` module sends the AI model:

- The current index mapping (source platform/version)
- The current settings (analyzers, filters, shards, replicas)
- The breaking changes guide from Phase 1
- Vector field context (if present) for intelligent `dense_vector` ↔ `knn_vector` conversion
- Cross-platform context (if migrating between ES and OpenSearch)
- A language instruction (`langInstruction()`) so the report is generated in the app's configured language

The model responds via **streaming** with a structured proposal containing:

| Field | Content |
|-------|---------|
| `mapping` | Converted mapping for target platform/version |
| `settings` | Settings optimized for target platform/version |
| `analyzers` | Compatible analyzers and token filters |
| `template` | Suggested index template |
| `aliases` | Recommended aliases |
| `report` | Narrative report explaining each decision made |
| `strategy` | Migration strategy (e.g. reindex, rollover, zero-downtime) |
| `vectorFieldsConverted` | Boolean flag indicating if vector fields were converted |

### Artifacts and approval

Each proposal is saved as a JSON file at `~/.migra-es/indices/{indexName}/proposal.json`. The user reviews the proposal in the **Proposal Review** screen — browsing tabs (Report / Mapping / Settings+Analyzers / Strategy) and approving or rejecting each index individually. For cross-platform migrations, the wizard displays an alert banner indicating the source and destination platforms.

Only approved indices proceed to execution. When executing, the **Migration Engine** reads the saved artifact and uses the proposal data to create the destination index, automatically adapting:
- Settings for the target platform (e.g., stripping Elasticsearch X-Pack settings for OpenSearch)
- Vector field configurations (e.g., injecting `index.knn: true` for OpenSearch knn_vector fields)

If no artifact exists (flow without AI), the auto-converters are used instead.

---

## AI provider configuration

Open the **AI Config** screen (`A` on the dashboard) or configure directly in `~/.migra-es/ai-config.json`:

```json
{
  "provider": "claude",
  "model": "claude-sonnet-4-6",
  "apiKey": "sk-ant-..."
}
```

Supported providers:

| Provider | Value | Recommended models |
|----------|-------|--------------------|
| Anthropic Claude | `claude` | `claude-sonnet-4-6`, `claude-opus-4-6` |
| OpenAI | `openai` | `gpt-4o`, `gpt-4-turbo` |
| Google Gemini | `gemini` | `gemini-1.5-pro` |
| Custom (OpenAI-compat.) | `custom` | any local model (Ollama, LM Studio, etc.) |

For custom providers, also include `"baseUrl": "http://localhost:11434/v1"`.

---

## Generated files and directories

| Path | Contents |
|------|----------|
| `data/tasks.json` | Persisted migration task state (LowDB) |
| `logs/application-*.log` | General application logs (Winston) |
| `logs/error-*.log` | Error logs |
| `~/.migra-es/ai-config.json` | AI provider configuration |
| `~/.migra-es/breaking-changes-memory.json` | AI-generated breaking changes cache (multi-version, multi-platform) |
| `~/.migra-es/indices/{name}/proposal.json` | Migration proposal per index with cross-platform details |

---

## Useful commands

```bash
# Stream logs in real time
tail -f logs/application-*.log

# Reset task state
rm data/tasks.json

# Check Redis
redis-cli ping

# Clear all breaking changes cache (including cross-platform and multi-version)
rm ~/.migra-es/breaking-changes-memory.json

# Clear proposal for a specific index
rm ~/.migra-es/indices/my-index/proposal.json

# View all saved proposals
ls -la ~/.migra-es/indices/
```

---

## Architecture overview

```
src/
├── cli/
│   ├── index.jsx                     # App root + screen state machine
│   ├── wizard.jsx                    # Multi-step wizard + AI routing
│   └── components/
│       ├── TaskList.jsx              # Dashboard / home screen
│       ├── AIProviderSelector.jsx    # AI provider configuration
│       ├── ImpactAnalysisView.jsx    # Impact analysis (streaming)
│       ├── BreakingChangesMemoryView # Breaking changes cache management
│       ├── MigrationProposalRunner   # Sequential per-index analysis runner
│       ├── MigrationProposalReview   # Proposal approve/reject workflow
│       └── IndexProposalDetail       # Tabbed proposal detail viewer
├── core/
│   ├── ai/
│   │   ├── aiConfig.js              # AI config read/write
│   │   ├── aiClient.js              # Provider factory
│   │   ├── providers/               # claude, openai, gemini, custom
│   │   ├── breakingChangesMemory.js # Persistent breaking changes cache
│   │   ├── impactAnalyzer.js        # Two-phase analysis pipeline
│   │   ├── indexArtifacts.js        # Per-index artifact CRUD
│   │   └── migrationProposal.js     # Proposal generation with i18n
│   ├── elasticsearch/
│   │   ├── client.js                # Creates ES/OpenSearch clients with SSL/auth support
│   │   ├── engineDetector.js        # Auto-detects Elasticsearch vs OpenSearch; cross-platform helpers
│   │   ├── indexManager.js          # getIndexMapping, getIndexSettings, createIndex, etc.
│   │   ├── bulkOperations.js        # bulkIndex, getFieldRange
│   │   └── legacyClient.js          # HTTP client for ES5 compatibility
│   ├── migration/
│   │   ├── mappingConverter.js      # Converts ES5→ES9 mappings, vector fields (dense_vector ↔ knn_vector)
│   │   ├── analyzerConverter.js     # Adapts analyzers/filters to target version
│   │   └── migrationEngine.js       # Orchestrates migration: scroll source → bulk index dest
│   ├── tasks/
│   │   ├── taskManager.js           # CRUD for migration tasks
│   │   └── queue.js                 # Bull queue processor
│   └── cache/
│       ├── redisClient.js           # ioredis connection singleton
│       └── cacheStrategy.js         # Index mapping/settings caching
├── i18n/locales/                    # en.json, pt-BR.json
└── utils/                           # config, logger, validators
```

---

## Cross-platform migration: Elasticsearch ↔ OpenSearch

IndexBridge supports seamless migrations between Elasticsearch and OpenSearch, including:

- **Auto-detection**: The wizard automatically detects whether each endpoint is Elasticsearch or OpenSearch using the `/` endpoint's `version.distribution` field.
- **Vector field conversion**: Automatically converts between `dense_vector` (Elasticsearch) and `knn_vector` (OpenSearch) fields, adjusting settings and parameters appropriately.
- **Version-aware breaking changes**: The breaking changes cache is keyed by platform and version pair (e.g., `ES:5→9`, `OS:2→3`, `ES→OS`), so migrations benefit from cached guidance regardless of direction.
- **Platform-aware settings**: The migration engine automatically sanitizes settings for the target platform (e.g., stripping X-Pack-specific fields when migrating to OpenSearch).
- **Engine-aware proposal generation**: AI-generated proposals include cross-platform context, ensuring recommendations account for platform-specific capabilities (e.g., OpenSearch's native vector search support).
- **Cross-solution UI indicator**: The wizard displays a cyan banner when migrating between different platforms, making the cross-platform nature of the operation clear.

---

## Key design decisions

- **Cross-platform client support**: The `@elastic/elasticsearch` v8 SDK is used for both Elasticsearch and OpenSearch (via compatibility mode). `engineDetector.js` wraps client calls to handle platform-specific quirks.
- **Engine detection**: The wizard calls `detectEngine()` after testing each connection, embedding the engine type in the connection config for use by all downstream components.
- **Control field**: A sortable field (numeric or date) used as a scroll cursor/checkpoint for resuming interrupted migrations.
- **AI proposals**: When an AI provider is configured, the wizard generates a per-index proposal before migration. Proposals are saved at `~/.migra-es/indices/{indexName}/proposal.json`.
- **Breaking changes cache**: Engine-namespaced cache keys enable reuse across both intra-version and cross-platform migrations, reducing AI API calls.
- **AI report language**: `migrationProposal.js` calls `langInstruction()` from the active i18n locale, ensuring all reports match the app's configured language (pt-BR or English).
- **Persistence**: Task state is stored in `data/tasks.json` via LowDB; AI proposals in `~/.migra-es/indices/`; configuration in `~/.migra-es/ai-config.json`.
