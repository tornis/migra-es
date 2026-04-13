# migra-es

> Also available in: [Português (pt-BR)](./README.pt-BR.md)

Terminal UI (TUI) for migrating indices from Elasticsearch 5 to Elasticsearch 9, with AI-powered impact analysis.

---

## Overview

**migra-es** is an interactive command-line tool that automates index migration between incompatible Elasticsearch versions. Migrating from ES5 to ES9 involves deep breaking changes in mappings, analyzers, settings, and APIs — migra-es handles all of that through a guided step-by-step flow.

When configured with an AI provider (Claude, OpenAI, Gemini, or a compatible endpoint), migra-es analyzes each index before migrating it, generates a detailed impact report, and proposes optimized mappings, settings, and analyzers for ES9. The user approves or rejects each proposal before any data is moved.

---

## Features

- **Interactive TUI** — keyboard-navigable terminal interface built with [Ink](https://github.com/vadimdemedes/ink)
- **Scroll + Bull queue migration** — uses the ES5 scroll API with Redis-backed queue processing for high resilience
- **Automatic mapping conversion** — converts ES5 types (`string` → `text`/`keyword`) and removes obsolete fields (`_all`, `_timestamp`, `include_in_all`)
- **Analyzer conversion** — adapts deprecated analyzers and token filters to ES9 equivalents
- **AI-powered impact analysis** — two-phase analysis pipeline per index; reports generated in the configured language (pt-BR or English)
- **Reviewable proposals** — AI-generated mapping, settings, analyzers, template, and aliases are presented for approval before execution
- **Breaking changes cache** — AI-generated ES5→ES9 breaking changes guide is persisted locally to avoid redundant API calls
- **Multi-provider** — supports Claude (Anthropic), OpenAI, Google Gemini, and any OpenAI-compatible endpoint
- **Internationalization** — UI and AI reports available in Portuguese (pt-BR) and English

---

## Prerequisites

- Node.js >= 18
- Redis running locally (or accessible over the network)
- Elasticsearch 5.x (source) reachable
- Elasticsearch 9.x (destination) reachable

---

## Installation

```bash
git clone <repo>
cd migra-es
npm install
cp .env.example .env
```

Edit `.env` with the minimum required settings:

```env
ES_SOURCE_URL=http://localhost:9200   # ES5 URL
ES_DEST_URL=http://localhost:9201     # ES9 URL
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

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

The `breakingChangesMemory` module checks whether a cached ES5→ES9 breaking changes guide already exists locally at `~/.migra-es/breaking-changes-memory.json`. If not, it queries the AI model for a structured list of incompatible changes between the two versions. The result is saved locally and reused in future analyses — avoiding unnecessary API calls.

### Phase 2 — Per-index proposal

With the breaking changes context in hand, the `migrationProposal` module sends the AI model:

- The current index mapping (ES5)
- The current settings (analyzers, filters, shards, replicas)
- The breaking changes guide from Phase 1
- A language instruction (`langInstruction()`) so the report is generated in the app's configured language

The model responds via **streaming** with a structured proposal containing:

| Field | Content |
|-------|---------|
| `mapping` | Converted mapping for ES9 |
| `settings` | Settings optimized for ES9 |
| `analyzers` | Compatible analyzers and token filters |
| `template` | Suggested index template |
| `aliases` | Recommended aliases |
| `report` | Narrative report explaining each decision made |
| `strategy` | Migration strategy (e.g. reindex, rollover, zero-downtime) |

### Artifacts and approval

Each proposal is saved as a JSON file at `~/.migra-es/indices/{indexName}/proposal.json`. The user reviews the proposal in the **Proposal Review** screen — browsing tabs (Report / Mapping / Settings+Analyzers / Strategy) and approving or rejecting each index individually.

Only approved indices proceed to execution. When executing, the **Migration Engine** reads the saved artifact and uses the proposal data to create the destination index. If no artifact exists (flow without AI), the auto-converters are used instead.

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
| `~/.migra-es/breaking-changes-memory.json` | AI-generated breaking changes cache |
| `~/.migra-es/indices/{name}/proposal.json` | Migration proposal per index |

---

## Useful commands

```bash
# Stream logs in real time
tail -f logs/application-*.log

# Reset task state
rm data/tasks.json

# Check Redis
redis-cli ping

# Clear breaking changes cache
rm ~/.migra-es/breaking-changes-memory.json

# Clear proposal for a specific index
rm ~/.migra-es/indices/my-index/proposal.json
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
│   ├── elasticsearch/               # Clients, indexManager, bulkOperations
│   ├── migration/                   # mappingConverter, analyzerConverter, migrationEngine
│   ├── tasks/                       # taskManager, queue (Bull)
│   └── cache/                       # redisClient, cacheStrategy
├── i18n/locales/                    # en.json, pt-BR.json
└── utils/                           # config, logger, validators
```
