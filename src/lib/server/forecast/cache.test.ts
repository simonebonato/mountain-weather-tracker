import { describe, expect, it, vi } from 'vitest';

import type { ForecastPayload } from '$lib/forecast/types';
import { createDatabase } from '$lib/server/db/index';
import { areas, keyPoints, outings, sources } from '$lib/server/db/schema';

import { ForecastCache } from './cache';
import { refreshOutingForecasts } from './refresh';

vi.mock('$lib/server/weather/open-meteo', () => ({
  fetchOpenMeteoForecasts: vi.fn()
}));

vi.mock('$lib/server/weather/agent', () => ({
  fetchAgentForecasts: vi.fn(),
  detectAgentCredentials: vi
    .fn()
    .mockReturnValue({ codex: true, claude: false })
}));

import { fetchOpenMeteoForecasts } from '$lib/server/weather/open-meteo';
import { fetchAgentForecasts } from '$lib/server/weather/agent';

const mockOpenMeteo = vi.mocked(fetchOpenMeteoForecasts);
const mockAgent = vi.mocked(fetchAgentForecasts);

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

describe('refresh adapter routing', () => {
  it('calls fetchOpenMeteoForecasts for open-meteo adapter', async () => {
    mockOpenMeteo.mockResolvedValue([{ ...payload, date: '2026-06-01' }]);
    mockAgent.mockReset();

    const { db, sqlite } = setupRefreshDb('open-meteo');

    await refreshOutingForecasts(1, { db, force: true });

    expect(mockOpenMeteo).toHaveBeenCalledTimes(1);
    expect(mockAgent).not.toHaveBeenCalled();
    sqlite.close();
  });

  it('calls fetchAgentForecasts for agent adapter', async () => {
    mockAgent.mockResolvedValue([
      { ...payload, source: 'TestAgent', date: '2026-06-01' }
    ]);
    mockOpenMeteo.mockReset();

    const { db, sqlite } = setupRefreshDb(
      'agent',
      'https://example.com/weather'
    );

    await refreshOutingForecasts(1, { db, force: true });

    expect(mockAgent).toHaveBeenCalledTimes(1);
    expect(mockOpenMeteo).not.toHaveBeenCalled();
    sqlite.close();
  });

  it('skips agent source when fetch_instructions is null', async () => {
    mockAgent.mockReset();
    mockOpenMeteo.mockReset();

    const { db, sqlite } = setupRefreshDb('agent', null);

    await refreshOutingForecasts(1, { db, force: true });

    expect(mockAgent).not.toHaveBeenCalled();
    sqlite.close();
  });

  it('skips unknown adapter without error', async () => {
    mockOpenMeteo.mockReset();
    mockAgent.mockReset();

    const { db, sqlite } = setupRefreshDb('unknown-adapter');

    await expect(
      refreshOutingForecasts(1, { db, force: true })
    ).resolves.not.toThrow();

    expect(mockOpenMeteo).not.toHaveBeenCalled();
    expect(mockAgent).not.toHaveBeenCalled();
    sqlite.close();
  });

  it('does not crash the pipeline when agent fetch throws', async () => {
    mockAgent.mockRejectedValue(new Error('agent failed'));

    const { db, sqlite } = setupRefreshDb('agent', 'https://example.com');

    await expect(
      refreshOutingForecasts(1, { db, force: true })
    ).resolves.not.toThrow();
    sqlite.close();
  });
});

function setupCache() {
  const { db, sqlite } = createDatabase();
  sqlite.exec('ALTER TABLE sources ADD COLUMN fetch_instructions TEXT');

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

function setupRefreshDb(
  adapter: string,
  fetchInstructions: string | null = null
) {
  const { db, sqlite } = createDatabase();
  sqlite.exec('ALTER TABLE sources ADD COLUMN fetch_instructions TEXT');

  db.insert(areas).values({ id: 1, name: 'Alps' }).run();
  db.insert(keyPoints)
    .values({
      id: 1,
      areaId: 1,
      name: 'Summit',
      latitude: 46.86,
      longitude: 9.53,
      elevationM: 2500
    })
    .run();
  db.insert(outings)
    .values({
      id: 1,
      areaId: 1,
      name: 'Test Outing',
      startDate: '2026-06-01',
      endDate: '2026-06-03'
    })
    .run();
  db.insert(sources)
    .values({
      id: 1,
      name: 'Test Source',
      adapter,
      geographicMatchScore: 1,
      domainSpecialtyScore: 1
    })
    .run();
  if (fetchInstructions !== null) {
    sqlite.exec(
      `UPDATE sources SET fetch_instructions = '${fetchInstructions.replace("'", "''")}' WHERE id = 1`
    );
  }

  return { db, sqlite };
}
