import Database from 'better-sqlite3';
import {
  drizzle,
  type BetterSQLite3Database
} from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import * as schema from './schema';
import { SCHEMA_SQL } from './schema-sql';
import { seedDemoData } from './seed';

export type AppDatabase = BetterSQLite3Database<typeof schema>;

type DatabaseHandle = {
  db: AppDatabase;
  sqlite: Database.Database;
};

let singleton: DatabaseHandle | null = null;

export function createDatabase(
  path = ':memory:',
  options: { seed?: boolean } = {}
): DatabaseHandle {
  if (path !== ':memory:') {
    mkdirSync(dirname(resolve(path)), { recursive: true });
  }

  const sqlite = new Database(path);
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(SCHEMA_SQL);

  const db = drizzle(sqlite, { schema });

  if (options.seed) {
    seedDemoData(db);
  }

  return { db, sqlite };
}

export function getDatabase(): AppDatabase {
  if (!singleton) {
    const path =
      process.env.DATABASE_PATH ?? 'data/mountain-weather-tracker.sqlite';
    singleton = createDatabase(path, { seed: true });
  }

  return singleton.db;
}

export function closeDatabase(): void {
  singleton?.sqlite.close();
  singleton = null;
}
