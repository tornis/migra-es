# migra-es

**migra-es** is an open-source terminal application for migrating Elasticsearch indices from legacy versions (2.x / 5.x / 6.x) to modern Elasticsearch 8/9.

It features a full-screen TUI (terminal user interface), a producer/consumer job queue backed by Redis, live progress monitoring, checkpoint-based resume, support for migrating multiple indices in a single session, and a fully internationalized interface (English / Portuguese).

---

## Features

- **Interactive TUI** — navigate with arrow keys; no config files needed for day-to-day use
- **Connection profiles** — save source and destination server configurations for reuse
- **Multi-index migration** — select and queue multiple indices in one wizard session
- **Live dashboard** — real-time write and read progress bars, status, doc counts, and error counts
- **Pause / Resume** — stop and continue a migration without losing progress (checkpoint via sortable control field)
- **Cancel** — gracefully stops both the reader and any queued writer batches
- **Reprocess** — delete the destination index and restart from zero, with a confirmation step
- **Mapping conversion** — automatically converts ES 2/5/6 mappings to ES 9 (`string` → `text`/`keyword`, removes deprecated metadata fields)
- **`source_type` field** — the ES 5/6 `_type` value is preserved as a `keyword` field in the destination
- **Fault-tolerant queue** — Redis-backed Bull queues survive worker crashes; atomic counters track exact progress
- **Structured logs** — Winston logger with daily rotation written to `~/.migra-es/logs/`
- **Internationalized TUI** — English and Portuguese (auto-detected from OS locale, or set `MIGRA_ES_LANG`)

---

## Requirements

| Dependency | Version |
|---|---|
| Node.js | >= 18 |
| Redis | >= 6 (must be running before start) |
| Source Elasticsearch | 2.x, 5.x, or 6.x |
| Destination Elasticsearch | 8.x or 9.x |

---

## Installation

### Global install (recommended)

```bash
npm install -g migra-es
migra-es
```

npm creates the command automatically:
- **Linux / macOS** — symlink at `/usr/local/bin/migra-es`
- **Windows** — wrapper script at `%APPDATA%\npm\migra-es.cmd`

### From source

```bash
git clone https://github.com/your-org/migra-es.git
cd migra-es
npm install
npm start
```

See [INSTALL.md](INSTALL.md) for detailed setup instructions and [QUICKSTART.md](QUICKSTART.md) for a step-by-step first-migration guide.

---

## Configuration

### Environment variables

Set in `~/.migra-es/.env` (global install default) or a `.env` file in the current directory (takes precedence):

```env
# Redis connection
REDIS_HOST=localhost
REDIS_PORT=6379
# REDIS_PASSWORD=

# Default ES endpoints (optional — can also be set in the wizard)
ES_SOURCE_URL=http://source-host:9200
ES_DEST_URL=http://dest-host:9200

# Migration tuning
MIGRATION_BATCH_SIZE=1000
MIGRATION_WORKER_THREADS=4
MIGRATION_SCROLL_SIZE=5000
MIGRATION_SCROLL_TIMEOUT=5m

# Language override (auto-detected from OS locale if not set)
# MIGRA_ES_LANG=en     # force English
# MIGRA_ES_LANG=pt-BR  # force Portuguese
```

### Data and logs

All state is stored under `~/.migra-es/`:

```
~/.migra-es/
├── .env                    # optional global config
├── data/
│   └── tasks.json          # task history and saved connection profiles
└── logs/
    ├── application-YYYY-MM-DD.log
    └── error-YYYY-MM-DD.log
```

---

## Internationalization

The TUI is fully internationalized. Language is auto-detected from the OS locale:

| System locale | Language shown |
|---|---|
| `pt_BR.*`, `pt.*` | Portuguese (pt-BR) |
| anything else | English |

To override:

```bash
MIGRA_ES_LANG=en migra-es        # force English
MIGRA_ES_LANG=pt-BR migra-es     # force Portuguese
```

To add a new language, create `src/i18n/locales/<locale>.json` following the structure of `en.json`, then add detection logic in `src/i18n/index.js`.

---

## Usage

### Dashboard (home screen)

```
 N  New Migration   •  2 active migrations
 ─────────────────────────────────────────────────────────────────
 Active

 ▶  orders  Running  ↳ created_at
    Created: 11/04/2024 09:15
    Write   ████████████░░░░░░░░░░░  52%    520,000 / 1,000,000 docs
    Read    ████████████████░░░░░░░  68%    680,000 queued

 History

    products  Completed
    Created: 10/04/2024 14:00   Completed: 10/04/2024 16:32
    45,000 / 45,000 docs

 ─────────────────────────────────────────────────────────────────
 ↑↓ navigate   Enter monitor   N new migration   Q quit
```

**Keyboard shortcuts:**

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate task list |
| `Enter` | Open detailed monitor for focused task |
| `N` | Start new migration wizard |
| `P` | Pause focused running task |
| `R` | Resume focused paused task |
| `C` | Cancel focused running/paused task |
| `E` | Reprocess focused completed/failed/cancelled task |
| `Q` | Quit |

### Migration wizard

Press `N` to start. Steps:

1. **Select connection** — saved profiles or new
2. **Source** — URL, auth, TLS (with `← SOURCE` badge)
3. **Destination** — URL, auth, TLS (with `→ DEST` badge)
4. **Save profile** — optionally name the connection pair
5. **Index selector** — three-column: index list / control field / migration queue

### Monitor screen

| Key | Action |
|-----|--------|
| `P` / `R` / `C` | Pause / Resume / Cancel |
| `Q` / `Esc` | Back to dashboard |

---

## Architecture

```
src/
├── cli/
│   ├── index.jsx               # Root App — screen state machine
│   ├── wizard.jsx              # Multi-step migration wizard
│   └── components/
│       ├── AppHeader.jsx
│       ├── TaskList.jsx        # Dashboard with live task rows
│       ├── ProgressMonitor.jsx # Detailed single-task monitor
│       ├── ConnectionForm.jsx  # Source/destination form (role badges)
│       ├── ConnectionSelector.jsx
│       ├── MultiIndexSelector.jsx  # 3-column index + field + queue
│       └── ConfirmDialog.jsx   # Destructive action confirmation
├── core/
│   ├── elasticsearch/          # Client, index management, bulk ops
│   ├── migration/              # Engine (reader + writer), mapping/analyzer converters
│   ├── tasks/                  # Bull queue processors + task manager
│   └── cache/                  # Redis client + mapping cache
├── database/
│   ├── db.js                   # LowDB → ~/.migra-es/data/tasks.json
│   └── connections.js          # Connection profile CRUD
├── i18n/
│   ├── index.js                # t() / tp() / locale detection
│   └── locales/
│       ├── en.json
│       └── pt-BR.json
└── utils/
    ├── config.js               # .env → typed config (APP_DIR = ~/.migra-es)
    ├── logger.js               # Winston → ~/.migra-es/logs/
    ├── validators.js
    └── fieldUtils.js
```

### Queue flow

```
Wizard → createMigrationTask → startMigrationTask
                                      │
                              [migration-reader queue]
                              runReader
                              ├─ scroll source ES in batches
                              ├─ store batch in Redis (TTL 2h)
                              ├─ INCR pending
                              └─ enqueue writer job
                                      │
                              [migration-writer queue]  (concurrency N)
                              runWriter
                              ├─ read + delete batch from Redis
                              ├─ bulkIndex to destination ES
                              ├─ INCRBY written / failed
                              └─ DECR pending → _checkCompletion
```

---

## Resetting state

```bash
# Remove all task history
rm ~/.migra-es/data/tasks.json

# Flush Redis migration keys
redis-cli KEYS "migration:*" | xargs redis-cli DEL
```

---

## License

MIT License — Copyright (c) 2024 **Rodrigo Tornis** — [Tornis Tecnologia](https://www.tornis.com.br)

The copyright notice and permission notice must be preserved in all copies.
See [LICENSE](LICENSE) for the full text.

---

## Author

**Rodrigo Tornis**
[Tornis Tecnologia](https://www.tornis.com.br)

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.
