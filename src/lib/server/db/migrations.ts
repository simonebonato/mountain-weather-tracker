import type Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrations = [
  {
    id: '0000_initial',
    path: resolve(process.cwd(), 'drizzle/0000_initial.sql')
  },
  {
    id: '0001_initial',
    path: resolve(process.cwd(), 'drizzle/0001_initial.sql')
  }
] as const;

export function runMigrations(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id TEXT PRIMARY KEY NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);

  const applied = new Set(
    sqlite
      .prepare('SELECT id FROM __drizzle_migrations')
      .all()
      .map((row) => (row as { id: string }).id)
  );

  const applyMigration = sqlite.transaction((id: string, sql: string) => {
    sqlite.exec(sql);
    sqlite
      .prepare(
        'INSERT INTO __drizzle_migrations (id, applied_at) VALUES (?, ?)'
      )
      .run(id, Date.now());
  });

  for (const migration of migrations) {
    if (!applied.has(migration.id)) {
      applyMigration(migration.id, readFileSync(migration.path, 'utf8'));
    }
  }
}
