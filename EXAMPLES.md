# Examples

## Example 1: Basic migration (single index, no authentication)

**Scenario**: Migrate the `products` index from a local ES 5 instance to a local ES 9 instance.

1. Start the application: `npm start`
2. Press `N` to open the wizard
3. At **Select connection**, choose `+ Nova Conexao`
4. **Source**: enter `http://localhost:9200`, skip user/password
5. **Destination**: enter `http://localhost:9201`, skip user/password
6. Name the profile `local-dev` and save
7. In the **Index selector**, navigate to `products` and press `Enter`
8. In the **Field selector**, choose `id` (or any numeric/date field) as the control field
9. The queue (right column) now shows `products — id`
10. Press `S` to start

The dashboard will show `products` as *Em andamento* with a live progress bar.

---

## Example 2: Migration with authentication and TLS

**Scenario**: Production source ES 6 (basic auth + TLS) to production ES 9 (API key).

1. Press `N` in the dashboard
2. Choose `+ Nova Conexao`
3. **Source**:
   - URL: `https://es5-prod.internal:9200`
   - User: `readonly_user`
   - Password: `***`
   - TLS: enabled
4. **Destination**:
   - URL: `https://es9-prod.internal:9200`
   - User: `migration_user`
   - Password: `***`
   - TLS: enabled
5. Save the profile as `prod`
6. Select the index and control field, then start

---

## Example 3: Migrating multiple indices in one session

1. Press `N` → select an existing connection profile
2. In the index selector:
   - Navigate to `orders`, press `Enter`, select `created_at` as control field → added to queue
   - Navigate to `customers`, press `Enter`, select `updated_at` → added to queue
   - Navigate to `products`, press `Enter`, choose no control field (`Sem campo de controle`) → added to queue
3. Press `S` — three migration tasks are created and started simultaneously
4. The dashboard shows all three with independent progress bars

---

## Example 4: Pausing and resuming a migration

A migration on a large index needs to be paused during peak hours:

1. On the dashboard, navigate to the running task with `↑`/`↓`
2. Press `P` — status changes to *Pausada*
3. Later, navigate back to the same task and press `R` — the migration resumes from where it stopped (using the `lastControlValue` checkpoint)

**Note**: A control field must have been selected for the checkpoint to work. Without a control field, the reader restarts from the beginning.

---

## Example 5: Reprocessing a failed migration

A migration completed but with mapping errors — you want to start fresh:

1. Navigate to the completed/failed task on the dashboard
2. Press `E` to reprocess
3. A confirmation dialog appears with a warning that the destination index will be **deleted**
4. Navigate to `Sim, apagar e reprocessar` and press `Enter`
5. A new migration task is created and started immediately; the old task remains in history

---

## Example 6: Monitoring in detail

1. Navigate to any active task on the dashboard
2. Press `Enter` to open the detailed monitor
3. The monitor shows:
   - ORIGEM and DESTINO badges with server URLs
   - Write progress bar (docs indexed to destination)
   - Read/enqueue progress bar (docs read from source, shown when significantly ahead of writes)
   - Number of pending batches awaiting the writer
   - Last checkpoint value (for resumable migrations)
   - Current throughput (docs/sec) and estimated time remaining
4. Press `Q` or `Esc` to return to the dashboard

---

## Example 7: Viewing logs during migration

In a separate terminal:

```bash
# Follow all application events
tail -f logs/application-$(date +%Y-%m-%d).log

# Follow errors only
tail -f logs/error-$(date +%Y-%m-%d).log

# Filter for a specific task ID
tail -f logs/application-$(date +%Y-%m-%d).log | grep "taskId"
```

---

## Example 8: `source_type` field in the destination

If your ES 5/6 index uses document types (e.g. `_type: "event"`), after migration each document in ES 9 will have an extra field:

```json
{
  "_index": "logs",
  "_id": "abc123",
  "_source": {
    "timestamp": "2024-01-15T10:30:00Z",
    "message": "user login",
    "source_type": "event"
  }
}
```

This allows you to filter by original type in ES 9:

```json
{
  "query": {
    "term": { "source_type": "event" }
  }
}
```
