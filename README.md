# Elasticsearch Migration Tool

A powerful Terminal User Interface (TUI) tool for migrating data from Elasticsearch 5 to Elasticsearch 9 with automatic mapping and analyzer compatibility conversion.

## Features

- 🎯 **Interactive TUI Wizard** - Step-by-step configuration process
- 🔄 **Automatic Compatibility** - Converts ES5 mappings and analyzers to ES9 format
- ⚡ **High Performance** - Multi-threaded migration with Redis caching
- 📊 **Real-time Progress** - Live progress monitoring with detailed statistics
- 💾 **Persistent Tasks** - Background processing with resume capability
- 🔍 **Field-based Control** - Track migration progress using a control field
- 🛡️ **Error Handling** - Automatic retries and comprehensive error logging

## Prerequisites

- Node.js >= 18.0.0
- Redis server (for caching and task queue)
- Elasticsearch 5.x (source)
- Elasticsearch 9.x (destination)

## Installation

1. Clone the repository:
```bash
cd /mnt/projetos/teste/migra-es
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

## Configuration

Edit the `.env` file to configure:

### Elasticsearch Source
- `ES_SOURCE_URL` - Source Elasticsearch URL
- `ES_SOURCE_USER` - Username (if authentication enabled)
- `ES_SOURCE_PASS` - Password (if authentication enabled)
- `ES_SOURCE_SSL` - Use SSL (true/false)
- `ES_SOURCE_REJECT_UNAUTHORIZED` - Verify SSL certificates (true/false)

### Elasticsearch Destination
- `ES_DEST_URL` - Destination Elasticsearch URL
- `ES_DEST_USER` - Username (if authentication enabled)
- `ES_DEST_PASS` - Password (if authentication enabled)
- `ES_DEST_SSL` - Use SSL (true/false)
- `ES_DEST_REJECT_UNAUTHORIZED` - Verify SSL certificates (true/false)

### Redis
- `REDIS_HOST` - Redis host (default: localhost)
- `REDIS_PORT` - Redis port (default: 6379)
- `REDIS_PASSWORD` - Redis password (if required)

### Performance Settings
- `BULK_SIZE` - Bulk indexing batch size (default: 1000)
- `WORKER_THREADS` - Number of worker threads (default: 4)
- `SCROLL_SIZE` - Scroll API batch size (default: 5000)
- `CACHE_TTL` - Cache time-to-live in seconds (default: 3600)

### Logging
- `LOG_LEVEL` - Logging level: debug, info, warn, error (default: info)
- `LOG_DIR` - Log directory (default: ./logs)

## Usage

### Start the Application

```bash
npm start
```

Or make it executable:

```bash
chmod +x src/cli/index.js
./src/cli/index.js
```

### Migration Wizard Flow

1. **Source Configuration**
   - Enter Elasticsearch source URL
   - Configure authentication (if needed)
   - Configure SSL settings
   - Test connection

2. **Destination Configuration**
   - Enter Elasticsearch destination URL
   - Configure authentication (if needed)
   - Configure SSL settings
   - Test connection

3. **Index Selection**
   - View list of available indices
   - Select index to migrate
   - View index metadata (document count, size)

4. **Control Field Selection**
   - Select a field to track migration progress
   - Recommended: timestamp or ID fields
   - Must be sortable (numeric or date type)

5. **Migration Process**
   - Automatic mapping conversion (ES5 → ES9)
   - Automatic analyzer conversion
   - Index creation on destination
   - Data migration with progress tracking
   - Background task execution

### Monitoring

The progress monitor shows:
- Migration status (running, paused, completed, failed)
- Progress bar with percentage
- Documents processed / total
- Failed documents count
- Transfer rate (docs/second)
- Elapsed time
- Estimated time remaining

### Controls

- **P** - Pause migration
- **R** - Resume migration
- **C** - Cancel migration
- **Q** - Close monitor / Quit application
- **ESC** - Cancel current operation
- **↑↓** - Navigate lists
- **Enter** - Select option

## Architecture

### Project Structure

```
src/
├── cli/                    # TUI components
│   ├── components/         # React Ink components
│   ├── wizard.js          # Migration wizard
│   └── index.js           # Main application
├── core/
│   ├── elasticsearch/     # ES client and operations
│   ├── migration/         # Migration engine and converters
│   ├── cache/            # Redis caching
│   └── tasks/            # Task management and queue
├── utils/                # Utilities (logger, config, validators)
└── database/             # LowDB persistence
```

### Key Components

- **Elasticsearch Client** - Connection management with SSL/Auth support
- **Mapping Converter** - ES5 → ES9 mapping compatibility
- **Analyzer Converter** - ES5 → ES9 analyzer compatibility
- **Migration Engine** - Multi-threaded data migration
- **Task Manager** - Background task processing with Bull
- **Cache Strategy** - Redis-based caching for performance
- **TUI Components** - Interactive terminal interface

## Mapping Conversions

### ES5 → ES9 Changes

| ES5 | ES9 | Notes |
|-----|-----|-------|
| `string` type | `text` or `keyword` | Based on analyzer |
| `_all` field | Removed | Use `copy_to` instead |
| `index: "analyzed"` | `index: true` | Boolean conversion |
| `index: "not_analyzed"` | `type: "keyword"` | Type change |
| `include_in_all` | Removed | Use `copy_to` |
| `_timestamp` | Removed | Use manual field |
| `_ttl` | Removed | Use ILM |

### Analyzer Conversions

- `snowball` → Custom analyzer with `stemmer` filter
- `nGram` → `ngram`
- `edgeNGram` → `edge_ngram`
- `delimited_payload_filter` → `delimited_payload`
- Deprecated filters are removed or replaced

## Logging

Logs are stored in the `logs/` directory:
- `application-YYYY-MM-DD.log` - All logs
- `error-YYYY-MM-DD.log` - Error logs only

Log rotation:
- Max file size: 20MB
- Retention: 14 days

## Troubleshooting

### Redis Connection Failed
```bash
# Start Redis server
redis-server
```

### Elasticsearch Connection Failed
- Verify URL and credentials
- Check SSL settings
- Ensure network connectivity
- Check Elasticsearch is running

### Migration Stuck
- Check logs in `logs/` directory
- Verify control field is sortable
- Check source Elasticsearch health
- Ensure sufficient memory

### High Memory Usage
- Reduce `BULK_SIZE`
- Reduce `SCROLL_SIZE`
- Reduce `WORKER_THREADS`
- Decrease `CACHE_TTL`

## Performance Tuning

For large indices:
1. Increase `BULK_SIZE` (e.g., 5000)
2. Increase `WORKER_THREADS` (match CPU cores)
3. Enable Redis caching
4. Use SSD storage
5. Increase Elasticsearch heap size

For slow networks:
1. Decrease `BULK_SIZE`
2. Increase `SCROLL_TIMEOUT`
3. Enable compression
4. Use local Redis

## Development

### Run in Development Mode
```bash
npm run dev
```

### View Logs
```bash
tail -f logs/application-*.log
```

### Clear Completed Tasks
Tasks are persisted in `data/tasks.json`. To clear:
```bash
rm data/tasks.json
```

## License

MIT

## Support

For issues and questions, check the logs in `logs/` directory and ensure all prerequisites are met.
