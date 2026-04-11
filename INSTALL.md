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

## Global install (recommended)

```bash
npm install -g migra-es
migra-es
```

npm creates the command in your system PATH automatically:
- **Linux / macOS** — symlink at `/usr/local/bin/migra-es` (or wherever your global bin is)
- **Windows** — wrapper script at `%APPDATA%\npm\migra-es.cmd`

No Node version managers required — works with the system Node.js or nvm/fnm.

### First-run setup

On first launch, migra-es creates `~/.migra-es/` automatically:

```
~/.migra-es/
├── data/
│   └── tasks.json    # created on first run
└── logs/
    ├── application-YYYY-MM-DD.log
    └── error-YYYY-MM-DD.log
```

To configure Redis or default ES endpoints, create `~/.migra-es/.env`:

```env
REDIS_HOST=localhost
REDIS_PORT=6379

# Optional defaults (can be overridden in the wizard)
ES_SOURCE_URL=http://es5-host:9200
ES_DEST_URL=http://es9-host:9200
```

---

## Install from source

```bash
git clone https://github.com/your-org/migra-es.git
cd migra-es
npm install
cp .env.example .env   # edit with your ES and Redis settings
npm start
```

When running from source, `data/` and `logs/` are created in the project directory (the project `.env` sets `DATA_DIR=./data` and `LOG_DIR=./logs`).

### Development mode (auto-reload)

```bash
npm run dev
```

---

## Start Redis

**Linux (systemd):**
```bash
sudo systemctl start redis
sudo systemctl enable redis
```

**macOS (Homebrew):**
```bash
brew services start redis
```

**Docker:**
```bash
docker run -d --name redis -p 6379:6379 redis:7-alpine
```

Verify:
```bash
redis-cli ping   # should print PONG
```

---

## Language

The TUI auto-detects the OS locale. To force a language:

```bash
MIGRA_ES_LANG=en migra-es       # English
MIGRA_ES_LANG=pt-BR migra-es    # Portuguese
```

Or set permanently in `~/.migra-es/.env`:

```env
MIGRA_ES_LANG=en
```

---

## Upgrading

```bash
npm update -g migra-es
```

Existing `~/.migra-es/data/tasks.json` and connection profiles are preserved across upgrades.

---

## Uninstalling

```bash
npm uninstall -g migra-es

# Optionally remove all data
rm -rf ~/.migra-es

# Optionally flush Redis migration keys
redis-cli KEYS "migration:*" | xargs redis-cli DEL
```

---

## Troubleshooting

### Redis connection refused

```
Failed to connect to Redis. Make sure Redis is running.
```

Check:
```bash
redis-cli -h $REDIS_HOST -p $REDIS_PORT ping
```

### Command not found after install

```bash
# Check npm global bin is in your PATH
npm bin -g          # prints the bin directory
echo $PATH          # check it's included
```

On macOS with Homebrew Node, add to `~/.zshrc` or `~/.bash_profile`:
```bash
export PATH="$(npm bin -g):$PATH"
```

### Reset all state

```bash
rm ~/.migra-es/data/tasks.json
redis-cli KEYS "migration:*" | xargs redis-cli DEL
migra-es
```
