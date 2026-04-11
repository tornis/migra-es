# migra-es

**migra-es** is an open-source terminal application for migrating Elasticsearch indices from legacy versions (2.x / 5.x / 6.x) to modern Elasticsearch 8/9.

It features a full-screen TUI (terminal user interface), a producer/consumer job queue backed by Redis, live progress monitoring, checkpoint-based resume, and support for migrating multiple indices in a single session.

---

## Features

- **Interactive TUI** — navigate with arrow keys; no config files needed for day-to-day use
- **Connection profiles** — save source and destination server configurations for reuse
- **Multi-index migration** — select and queue multiple indices in one wizard session
- **Live dashboard** — real-time write and read progress bars, status, doc counts, and error counts
- **Pause / Resume** — stop and continue a migration without losing progress (uses a sortable control field as checkpoint)
- **Cancel** — gracefully stops both the reader and any queued writer batches
- **Reprocess** — delete the destination index and restart from zero, with a confirmation step
- **Mapping conversion** — automatically converts ES 2/5/6 mappings to ES 9 (type `string` → `text`/`keyword`, removes deprecated metadata fields)
- **`source_type` field** — the ES 5/6 `_type` value is preserved as a `keyword` field in the destination
- **Fault-tolerant queue** — Redis-backed Bull queues survive worker crashes; atomic counters track exact progress
- **Structured logs** — Winston logger with daily rotation written to the `logs/` directory

---

## Requirements

| Dependency | Version |
|---|---|
| Node.js | >= 18 |
| Redis | >= 6 (must be running before start) |
| Source Elasticsearch | 2.x, 5.x, or 6.x |
| Destination Elasticsearch | 8.x or 9.x |

---

## Quick start

```bash
# 1. Clone the repository
git clone https://github.com/your-org/migra-es.git
cd migra-es

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your ES and Redis connection details

# 4. Make sure Redis is running
redis-cli ping  # should return PONG

# 5. Launch
npm start
```

See [INSTALL.md](INSTALL.md) for detailed setup instructions.
See [QUICKSTART.md](QUICKSTART.md) for a step-by-step first-migration guide.

---

## Usage

### Starting the application

```bash
npm start
```

On startup, migra-es:
1. Connects to the database (`data/tasks.json`)
2. Tests the Redis connection
3. Initialises the reader and writer Bull queues
4. Shows the dashboard

### Dashboard (home screen)

```
 migra-es
 ─────────────────────────────────────────────────────────────────
 N  Nova Migracao   •  2 migracoes ativas

 Ativas

 ▶  orders  Em andamento  ↳ created_at
    Criado: 11/04/2024 09:15
    Escrita  ████████████░░░░░░░░░░░  52%    520.000 / 1.000.000 docs
    Leitura  ████████████████░░░░░░░  68%    680.000 enfileirados

 Historico

    products  Concluida
    Criado: 10/04/2024 14:00   Concluido: 10/04/2024 16:32
    45.000 / 45.000 docs

 ─────────────────────────────────────────────────────────────────
 ↑↓ navegar   Enter monitorar   N nova migracao   Q sair
```

**Keyboard shortcuts on the dashboard:**

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

Press `N` to start the wizard. It walks through:

1. **Select connection** — choose a saved profile or create a new one
2. **Source configuration** — URL, optional user/password/TLS for the origin ES cluster
3. **Destination configuration** — URL, optional user/password/TLS for the target ES cluster
4. **Save profile** — optionally name and save the connection pair for future use
5. **Index selector** — three-column view:
   - *Left*: searchable index list (press `/` to filter); press `→` or `Enter` to select
   - *Middle*: available sortable fields for the selected index (used as migration checkpoint)
   - *Right*: migration queue; press `D` to remove an item, `S` to start all queued migrations
6. **Confirmation** — destructive operations (reprocess) require explicit confirmation

### Monitor screen

Open by pressing `Enter` on any task. Shows:
- Source and destination URLs
- Write progress bar (docs indexed to destination)
- Read/enqueue progress bar (docs read from source, when ahead of writes)
- Pending batch count and reader status
- Last checkpoint value
- Docs per second and estimated time remaining

**Keyboard shortcuts in the monitor:**

| Key | Action |
|-----|--------|
| `P` | Pause |
| `R` | Resume |
| `C` | Cancel |
| `Q` / `Esc` | Return to dashboard |

---

## Architecture

```
src/
├── cli/
│   ├── index.jsx               # Root App component + screen state machine
│   ├── wizard.jsx              # Multi-step migration wizard
│   └── components/
│       ├── AppHeader.jsx       # Top banner (shared across screens)
│       ├── TaskList.jsx        # Dashboard with live task rows
│       ├── ProgressMonitor.jsx # Detailed single-task monitor
│       ├── ConnectionForm.jsx  # Source/destination connection form
│       ├── MultiIndexSelector.jsx  # 3-column index + field + queue selector
│       └── ConfirmDialog.jsx   # Destructive action confirmation screen
├── core/
│   ├── elasticsearch/
│   │   ├── client.js           # @elastic/elasticsearch v8 client factory
│   │   ├── indexManager.js     # Mapping, settings, create, count, exists
│   │   └── bulkOperations.js   # bulkIndex, scrollDocuments, getFieldRange
│   ├── migration/
│   │   ├── migrationEngine.js  # runReader (scroll + enqueue) and runWriter (bulk index)
│   │   ├── mappingConverter.js # ES 2/5/6 → ES 9 mapping conversion
│   │   └── analyzerConverter.js # Deprecated analyzer/filter upgrades
│   ├── tasks/
│   │   ├── taskManager.js      # Task CRUD, queue lifecycle, reprocess
│   │   ├── queue.js            # initQueueProcessor (wires reader + writer)
│   │   ├── readerQueue.js      # Bull reader processor (concurrency 4)
│   │   └── writerQueue.js      # Bull writer processor (configurable concurrency)
│   └── cache/
│       ├── redisClient.js      # ioredis singleton
│       └── cacheStrategy.js    # Redis cache for ES mappings/settings
├── database/
│   ├── db.js                   # LowDB JSON persistence (data/tasks.json)
│   └── connections.js          # Connection profile CRUD
└── utils/
    ├── config.js               # .env → typed config object
    ├── logger.js               # Winston + daily-rotate-file
    ├── validators.js           # Zod schemas for wizard input
    └── fieldUtils.js           # extractSortableFields from ES mapping
```

### Queue flow

```
Wizard → createMigrationTask → startMigrationTask
                                      │
                              [migration-reader queue]
                                      │
                              runReader (migrationEngine)
                              ├─ scroll source ES (batches)
                              ├─ store batch payload in Redis (TTL 2h)
                              ├─ INCR pending
                              ├─ enqueue writer job (batchKey reference)
                              └─ update progress (enqueued, lastControlValue)
                                      │
                              [migration-writer queue]  (concurrency N)
                                      │
                              runWriter (migrationEngine)
                              ├─ read + delete batch from Redis
                              ├─ bulkIndex to destination ES
                              ├─ INCRBY written / failed
                              └─ DECR pending → _checkCompletion
```

### Pause / Resume

- **Pause**: sets `migration:{id}:paused` Redis key; reader checks this flag before each batch and stops gracefully
- **Resume**: clears the flag, resets `pending` counter, re-queues a reader job starting from `lastControlValue`

### `source_type` field

Elasticsearch 2/5/6 documents carry a `_type` metadata field (e.g. `"line"`, `"event"`). Since ES 7+ removed types, migra-es:

1. **Mapping**: adds `source_type: { type: "keyword" }` to the destination mapping (only when the source uses typed mappings)
2. **Documents**: copies `_type` value into `_source.source_type` during bulk indexing (skipped when `_type` is `"_doc"`)

---

## Configuration

Copy `.env.example` to `.env`:

```env
# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
# REDIS_PASSWORD=

# Default Elasticsearch endpoints (optional — can also be set in the wizard)
ES_SOURCE_URL=http://localhost:9200
ES_DEST_URL=http://localhost:9201

# Migration tuning
MIGRATION_BATCH_SIZE=1000
MIGRATION_WORKER_THREADS=4
MIGRATION_SCROLL_SIZE=5000
MIGRATION_SCROLL_TIMEOUT=5m
```

All wizard-entered connection details are stored in `data/tasks.json` and never need to be re-entered.

---

## Logs

```bash
# Live application log
tail -f logs/application-$(date +%Y-%m-%d).log

# Live error log
tail -f logs/error-$(date +%Y-%m-%d).log
```

Logs rotate daily and are kept for 14 days by default.

---

## Resetting state

```bash
# Remove all task history (dashboard will be empty after restart)
rm data/tasks.json

# Flush Redis migration keys (does not affect saved connection profiles)
redis-cli KEYS "migration:*" | xargs redis-cli DEL
```

---

## License

MIT License — Copyright (c) 2024 **Rodrigo Tornis** — [Tornis Tecnologia](https://www.tornis.com.br)

You are free to use, modify, and distribute this software under the terms of the MIT License. The copyright notice and this permission notice must be preserved in all copies or substantial portions of the software.

See [LICENSE](LICENSE) for the full text.

---

## Author

**Rodrigo Tornis**
[Tornis Tecnologia](https://www.tornis.com.br)

---

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.
