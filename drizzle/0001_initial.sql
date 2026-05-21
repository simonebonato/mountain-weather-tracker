CREATE TABLE IF NOT EXISTS verdict_snapshots (
  outing_id INTEGER PRIMARY KEY NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('Good', 'Uncertain', 'Bad')),
  seen_at INTEGER NOT NULL,
  FOREIGN KEY (outing_id) REFERENCES outings(id) ON DELETE CASCADE
);
