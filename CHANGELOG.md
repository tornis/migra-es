# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2024

### Added

- **TUI dashboard** — full-screen terminal interface built with Ink (React for terminal)
- **Connection profile management** — save, reuse, and test source/destination server configurations
- **Multi-index migration** — migrate multiple indices in a single wizard session
- **Producer/consumer queue architecture** — reader queue scrolls source ES, writer queue bulk-indexes to destination
- **Live progress bars** — separate write progress (yellow) and read/enqueue progress (amber) on the dashboard
- **Pause / Resume** — graceful pause using a Redis flag checked per-batch; resume continues from the last checkpoint
- **Cancel** — sets a Redis flag and removes pending writer jobs from the queue
- **Reprocess** — delete the destination index and restart the migration from zero, with a destructive action confirmation dialog
- **Checkpoint / resume** — `controlField > lastControlValue` range query so interrupted migrations don't re-read already-migrated data
- **Mapping conversion** — converts ES 2/5/6 mappings to ES 9 (e.g. `string` → `text`/`keyword`, removes deprecated `_all`, `_timestamp`, `include_in_all`)
- **Analyzer conversion** — upgrades deprecated ES 5/6 analyzers and token filters to ES 9 equivalents
- **`source_type` field** — ES 2/5/6 `_type` metadata is preserved as a `keyword` field `source_type` in the destination index
- **Atomic Redis counters** — `written`, `failed`, and `pending` counters survive worker restarts
- **Persistent task history** — task records stored in `data/tasks.json` via LowDB; survives application restarts
- **Structured logging** — Winston logger with daily log rotation to the `logs/` directory
- **Connection testing** — both source and destination connections are tested before any migration starts
