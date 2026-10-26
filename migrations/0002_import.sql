-- Import Worker state (workers/import): one row per feed + run log.
CREATE TABLE feed_state (
  feed TEXT PRIMARY KEY,               -- Feed__n
  created_at TEXT NOT NULL,
  last_attempt_at TEXT,
  last_success_at TEXT,
  last_count INTEGER NOT NULL DEFAULT 0,
  last_message TEXT,
  etag TEXT,
  last_modified TEXT
) STRICT, WITHOUT ROWID;

CREATE TABLE import_runs (
  id INTEGER PRIMARY KEY,
  feed TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  status TEXT NOT NULL,
  items_read INTEGER NOT NULL DEFAULT 0,
  items_matched INTEGER NOT NULL DEFAULT 0,
  items_created INTEGER NOT NULL DEFAULT 0,
  items_changed INTEGER NOT NULL DEFAULT 0,
  items_deactivated INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  message TEXT NOT NULL DEFAULT ''
) STRICT;
CREATE INDEX idx_import_runs_feed ON import_runs(feed, id DESC);
