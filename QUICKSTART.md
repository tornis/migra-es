# Quick Start

Get your first migration running in under 5 minutes.

---

## Prerequisites

- Node.js >= 18 installed
- Redis running (`redis-cli ping` returns `PONG`)
- Source ES 2/5/6 and destination ES 8/9 reachable from this machine

---

## Step 1 — Install

```bash
git clone https://github.com/your-org/migra-es.git
cd migra-es
npm install
cp .env.example .env
```

Edit `.env` and set at minimum:

```env
REDIS_HOST=localhost
REDIS_PORT=6379
```

---

## Step 2 — Start

```bash
npm start
```

The application initializes Redis and the job queues, then shows the dashboard.

---

## Step 3 — Start the migration wizard

Press `N` on the dashboard.

---

## Step 4 — Configure connections

**If this is your first run** — choose `+ Nova Conexao` to create a connection profile:

1. Enter the **source** Elasticsearch URL (e.g. `http://es5-host:9200`)
   - Add credentials if required
2. Enter the **destination** Elasticsearch URL (e.g. `http://es9-host:9200`)
   - Add credentials if required
3. Both connections are tested automatically; the wizard won't proceed if either fails
4. Optionally name and save the profile for future use (e.g. `staging`)

**On subsequent runs** — select the saved profile from the list.

---

## Step 5 — Select an index

The index selector has three columns:

| Column | Content | Navigation |
|--------|---------|------------|
| Left | All indices on the source cluster | `↑`/`↓` to move, `/` to search, `→` or `Enter` to select |
| Middle | Sortable fields for the selected index | `↑`/`↓` to choose, `Enter` to confirm |
| Right | Migration queue | `D` to remove, `S` to start |

**Choose a control field** (recommended): a numeric or date field that is unique and always increasing (e.g. `id`, `created_at`). This enables checkpoint-based resume — if the migration is paused or interrupted, it continues from where it left off.

If the index has no suitable field, select `Sem campo de controle` at the bottom of the field list. The migration will still work, but a restart will re-read all documents.

Repeat for as many indices as you want to migrate in this session.

---

## Step 6 — Start

Press `S` in the queue column. One migration task is created per index.

---

## Step 7 — Monitor progress

Back on the dashboard you will see each task with:
- Status (`Em andamento`, `Pausada`, `Concluida`, `Falhou`)
- Write progress bar
- Read/enqueue progress bar (shown when the reader is ahead)
- Doc counts and failure count

Press `Enter` on any task for the detailed monitor screen.

---

## Keyboard reference

| Screen | Key | Action |
|--------|-----|--------|
| Dashboard | `N` | New migration wizard |
| Dashboard | `↑`/`↓` | Navigate |
| Dashboard | `Enter` | Open monitor |
| Dashboard | `P` | Pause running task |
| Dashboard | `R` | Resume paused task |
| Dashboard | `C` | Cancel task |
| Dashboard | `E` | Reprocess completed/failed task |
| Dashboard | `Q` | Quit |
| Monitor | `P`/`R`/`C` | Pause / Resume / Cancel |
| Monitor | `Q` / `Esc` | Back to dashboard |
| Wizard | `Esc` | Previous step / cancel |
| Any screen | `Q` | Back or quit |

---

## Next steps

- [EXAMPLES.md](EXAMPLES.md) — more detailed usage scenarios
- [INSTALL.md](INSTALL.md) — full installation and configuration reference
- [README.md](README.md) — architecture overview
