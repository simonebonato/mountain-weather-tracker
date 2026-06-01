import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDatabase } from '$lib/server/db/index';
import { sources } from '$lib/server/db/schema';

describe('settings form actions', () => {
  it('stores fetch instructions for a source', () => {
    const { db, sqlite } = createDatabase();

    db.insert(sources)
      .values({
        name: 'Test Source',
        adapter: 'test',
        geographicMatchScore: 1,
        domainSpecialtyScore: 1
      })
      .run();

    const instructions = 'Visit https://example.com for data';
    db.update(sources)
      .set({ fetchInstructions: instructions })
      .where(eq(sources.id, 1))
      .run();

    const updated = db.select().from(sources).where(eq(sources.id, 1)).get();

    expect(updated?.fetchInstructions).toBe(instructions);
    sqlite.close();
  });

  it('clears fetch instructions when set to empty string', () => {
    const { db, sqlite } = createDatabase();

    db.insert(sources)
      .values({
        name: 'Test Source',
        adapter: 'test',
        geographicMatchScore: 1,
        domainSpecialtyScore: 1,
        fetchInstructions: 'Original instructions'
      })
      .run();

    db.update(sources)
      .set({ fetchInstructions: null })
      .where(eq(sources.id, 1))
      .run();

    const updated = db.select().from(sources).where(eq(sources.id, 1)).get();

    expect(updated?.fetchInstructions).toBeNull();
    sqlite.close();
  });

  it('preserves fetch instructions for existing sources', () => {
    const { db, sqlite } = createDatabase();

    const instructions = 'Original fetch instructions';
    db.insert(sources)
      .values({
        name: 'Open-Meteo',
        adapter: 'open-meteo',
        geographicMatchScore: 0.95,
        domainSpecialtyScore: 0.85,
        fetchInstructions: instructions
      })
      .run();

    const row = db.select().from(sources).where(eq(sources.id, 1)).get();

    expect(row?.fetchInstructions).toBe(instructions);
    expect(row?.name).toBe('Open-Meteo');
    expect(row?.adapter).toBe('open-meteo');

    sqlite.close();
  });
});
