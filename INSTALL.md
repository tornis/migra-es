# Installation

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | >= 18.0.0 | `node --version` |
| npm | >= 9 | Bundled with Node 18 |
| Redis | >= 6.0 | Must be running before launch |
| Source Elasticsearch | 2.x, 5.x, or 6.x | Network-accessible from this machine |
| Destination Elasticsearch | 8.x or 9.x | Network-accessible from this machine |

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/your-org/migra-es.git
cd migra-es
```

### 2. Install Node.js dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```env
# Redis connection
REDIS_HOST=localhost
REDIS_PORT=6379
# REDIS_PASSWORD=yourpassword   # uncomment if Redis requires auth

# Default Elasticsearch endpoints (optional)
# These are pre-filled in the wizard but can be overridden there
ES_SOURCE_URL=http://source-host:9200
ES_DEST_URL=http://dest-host:9200

# Migration tuning
MIGRATION_BATCH_SIZE=1000        # docs per writer job
MIGRATION_WORKER_THREADS=4       # parallel writer workers
MIGRATION_SCROLL_SIZE=5000       # docs per scroll page from source
MIGRATION_SCROLL_TIMEOUT=5m      # ES scroll context timeout
```

### 4. Start Redis

**Linux (systemd):**
```bash
sudo systemctl start redis
sudo systemctl enable redis   # start on boot
```

**macOS (Homebrew):**
```bash
brew services start redis
```

**Docker:**
```bash
docker run -d --name redis -p 6379:6379 redis:7-alpine
```

Verify Redis is responding:
```bash
redis-cli ping   # should print PONG
```

### 5. Launch

```bash
npm start
```

---

## Development mode

Automatically reloads the application when source files change:

```bash
npm run dev
```

---

## Directory structure after first run

```
migra-es/
├── data/
│   └── tasks.json          # Task history and saved connection profiles
├── logs/
│   ├── application-YYYY-MM-DD.log
│   └── error-YYYY-MM-DD.log
└── ...
```

Both directories are created automatically on first start.

---

## Upgrading

```bash
git pull
npm install
npm start
```

Existing `data/tasks.json` and connection profiles are preserved across upgrades.

---

## Uninstalling

```bash
# Remove the application directory
cd ..
rm -rf migra-es

# Optionally flush Redis migration keys
redis-cli KEYS "migration:*" | xargs redis-cli DEL
```

---

## Troubleshooting

### Redis connection refused

```
Falha ao conectar ao Redis. Certifique-se de que o Redis esta rodando.
```

Check that Redis is running and that `REDIS_HOST`/`REDIS_PORT` in `.env` are correct:

```bash
redis-cli -h $REDIS_HOST -p $REDIS_PORT ping
```

### Elasticsearch connection errors in the wizard

The wizard tests both source and destination connections before proceeding. If the test fails, verify:
- The URL is reachable from this machine (`curl http://host:9200`)
- TLS/certificate settings are correct
- Authentication credentials are valid

### Application does not quit on `Q`

Press `Q` only from the main dashboard (home screen). From nested screens, `Esc` or `Q` returns to the dashboard first; then a second `Q` quits.

### Reset all task state

```bash
rm data/tasks.json
redis-cli KEYS "migration:*" | xargs redis-cli DEL
npm start
```
