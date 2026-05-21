export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS areas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS key_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  area_id INTEGER NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  elevation_m REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS outings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  area_id INTEGER NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  activity TEXT NOT NULL DEFAULT 'hiking',
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  current_verdict TEXT NOT NULL DEFAULT 'Uncertain' CHECK (current_verdict IN ('Good', 'Uncertain', 'Bad')),
  last_updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  summary_json TEXT NOT NULL DEFAULT '{"metrics":[],"days":[]}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  adapter TEXT NOT NULL,
  geographic_match_score REAL NOT NULL DEFAULT 1,
  domain_specialty_score REAL NOT NULL DEFAULT 1,
  reliability_score REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS forecasts (
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  key_point_id INTEGER NOT NULL REFERENCES key_points(id) ON DELETE CASCADE,
  forecast_date TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  temperature_c REAL NOT NULL DEFAULT 0,
  precipitation_mm REAL NOT NULL DEFAULT 0,
  wind_kmh REAL NOT NULL DEFAULT 0,
  visibility_km REAL NOT NULL DEFAULT 0,
  thunderstorm_probability_pct INTEGER NOT NULL DEFAULT 0,
  snow_depth_cm INTEGER NOT NULL DEFAULT 0,
  freeze_level_m INTEGER NOT NULL DEFAULT 0,
  avalanche_risk INTEGER NOT NULL DEFAULT 1,
  payload TEXT NOT NULL,
  PRIMARY KEY (source_id, key_point_id, forecast_date)
);

CREATE TABLE IF NOT EXISTS verdict_snapshots (
  outing_id INTEGER PRIMARY KEY NOT NULL REFERENCES outings(id) ON DELETE CASCADE,
  verdict TEXT NOT NULL CHECK (verdict IN ('Good', 'Uncertain', 'Bad')),
  seen_at INTEGER NOT NULL
);
`;
