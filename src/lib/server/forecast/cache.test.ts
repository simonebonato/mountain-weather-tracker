import { describe, expect, it } from 'vitest';

import type { ForecastPayload } from '$lib/forecast/types';
import { createDatabase } from '$lib/server/db/index';
import { areas, keyPoints, sources } from '$lib/server/db/schema';

import { ForecastCache } from './cache';

const payload: ForecastPayload = {
  source: 'Open-Meteo',
  date: '2026-05-21',
  temperatureC: 12.5,
  precipitationMm: 1.2,
  windSpeedKmh: 18,
  visibilityM: 15000
};

describe('ForecastCache', () => {
  it('returns null on cache miss', () => {
    const { cache, sqlite } = setupCache();

    expect(
      cache.get({ sourceId: 1, keyPointId: 1, forecastDate: '2026-05-21' })
    ).toBeNull();
    sqlite.close();
  });

  it('returns a cache hit within the 6-hour TTL', () => {
    const { cache, sqlite } = setupCache();
    const fetchedAt = new Date('2026-05-21T06:00:00.000Z');

    cache.set({
      sourceId: 1,
      keyPointId: 1,
      forecastDate: '2026-05-21',
      fetchedAt,
      payload
    });

    const cached = cache.get(
      { sourceId: 1, keyPointId: 1, forecastDate: '2026-05-21' },
      new Date('2026-05-21T11:59:59.000Z')
    );

    expect(cached?.payload).toEqual(payload);
    expect(cached?.fetchedAt.toISOString()).toBe(fetchedAt.toISOString());
    sqlite.close();
  });

  it('returns null for entries older than 6 hours', () => {
    const { cache, sqlite } = setupCache();

    cache.set({
      sourceId: 1,
      keyPointId: 1,
      forecastDate: '2026-05-21',
      fetchedAt: new Date('2026-05-21T06:00:00.000Z'),
      payload
    });

    expect(
      cache.get(
        { sourceId: 1, keyPointId: 1, forecastDate: '2026-05-21' },
        new Date('2026-05-21T12:00:01.000Z')
      )
    ).toBeNull();
    sqlite.close();
  });

  it('roundtrips set and get', () => {
    const { cache, sqlite } = setupCache();

    cache.set({
      sourceId: 1,
      keyPointId: 1,
      forecastDate: '2026-05-21',
      fetchedAt: new Date('2026-05-21T08:30:00.000Z'),
      payload
    });

    const cached = cache.get(
      { sourceId: 1, keyPointId: 1, forecastDate: '2026-05-21' },
      new Date('2026-05-21T09:00:00.000Z')
    );

    expect(cached).toMatchObject({
      sourceId: 1,
      keyPointId: 1,
      forecastDate: '2026-05-21',
      payload
    });
    sqlite.close();
  });
});

function setupCache() {
  const { db, sqlite } = createDatabase();

  db.insert(sources)
    .values({
      id: 1,
      name: 'Open-Meteo',
      adapter: 'open-meteo',
      geographicMatchScore: 1,
      domainSpecialtyScore: 1
    })
    .run();
  db.insert(areas).values({ id: 1, name: 'Test Area' }).run();
  db.insert(keyPoints)
    .values({
      id: 1,
      areaId: 1,
      name: 'Summit',
      latitude: 46.86,
      longitude: 6.86,
      elevationM: 1400
    })
    .run();

  return {
    cache: new ForecastCache(db),
    sqlite
  };
}
