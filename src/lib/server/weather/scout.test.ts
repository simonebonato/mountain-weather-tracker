import { describe, expect, it, vi } from 'vitest';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import {
  buildScoutPrompt,
  parseScoutOutput,
  fetchScoutForecasts
} from './scout';

vi.mock('node:fs', () => ({ existsSync: vi.fn() }));

const mockExistsSync = vi.mocked(existsSync);

const keyPoint = { latitude: 46.85, longitude: 9.53, elevationM: 2844 };
const activity = 'hiking';
const dates = ['2026-06-01', '2026-06-02'];
const scoutingNotes = 'Alpine region, high elevation';

describe('buildScoutPrompt', () => {
  it('returns a string prompt with location, activity, and dates', () => {
    const prompt = buildScoutPrompt(keyPoint, activity, scoutingNotes, dates);

    expect(typeof prompt).toBe('string');
    expect(prompt).toContain('46.85');
    expect(prompt).toContain('9.53');
    expect(prompt).toContain('2844');
    expect(prompt).toContain('hiking');
    expect(prompt).toContain('2026-06-01');
    expect(prompt).toContain('2026-06-02');
    expect(prompt).toContain('Alpine region, high elevation');
  });

  it('includes seed list of known regional weather services', () => {
    const prompt = buildScoutPrompt(keyPoint, activity, scoutingNotes, dates);

    expect(prompt).toContain('MeteoSvizzera');
    expect(prompt).toContain('ZAMG');
    expect(prompt).toContain('Météo-France');
    expect(prompt).toContain('SRF Meteo');
    expect(prompt).toContain('yr.no');
    expect(prompt).toContain('Meteoblue');
  });

  it('handles missing elevation gracefully', () => {
    const keyPointNoElev = { latitude: 46.85, longitude: 9.53 };
    const prompt = buildScoutPrompt(
      keyPointNoElev,
      activity,
      scoutingNotes,
      dates
    );

    expect(prompt).toContain('46.85');
    expect(prompt).toContain('9.53');
    expect(prompt).not.toContain('undefined');
  });

  it('works without scouting notes', () => {
    const prompt = buildScoutPrompt(keyPoint, activity, '', dates);

    expect(typeof prompt).toBe('string');
    expect(prompt).toContain('46.85');
  });
});

describe('parseScoutOutput', () => {
  const validOutput = [
    {
      sourceName: 'MeteoSvizzera',
      geographicMatchScore: 0.95,
      domainSpecialtyScore: 0.9,
      date: '2026-06-01',
      temperatureC: 12,
      precipitationMm: 0,
      windSpeedKmh: 15,
      visibilityM: 15000
    },
    {
      sourceName: 'MeteoSvizzera',
      geographicMatchScore: 0.95,
      domainSpecialtyScore: 0.9,
      date: '2026-06-02',
      temperatureC: 8,
      precipitationMm: 3.5,
      windSpeedKmh: 30,
      visibilityM: 7000
    },
    {
      sourceName: 'ZAMG',
      geographicMatchScore: 0.85,
      domainSpecialtyScore: 0.88,
      date: '2026-06-01',
      temperatureC: 11,
      precipitationMm: 0.5,
      windSpeedKmh: 12,
      visibilityM: 12000
    }
  ];

  it('groups payloads by sourceName into ScoutResult[]', () => {
    const result = parseScoutOutput(JSON.stringify(validOutput));

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result[0].sourceName).toBe('MeteoSvizzera');
    expect(result[1].sourceName).toBe('ZAMG');
  });

  it('extracts geographicMatchScore and domainSpecialtyScore from first row per source', () => {
    const result = parseScoutOutput(JSON.stringify(validOutput));

    expect(result[0].geographicMatchScore).toBe(0.95);
    expect(result[0].domainSpecialtyScore).toBe(0.9);
    expect(result[1].geographicMatchScore).toBe(0.85);
    expect(result[1].domainSpecialtyScore).toBe(0.88);
  });

  it('groups all payloads for a source under one ScoutResult', () => {
    const result = parseScoutOutput(JSON.stringify(validOutput));

    const meteoSvizzera = result.find((r) => r.sourceName === 'MeteoSvizzera');
    expect(meteoSvizzera?.payloads).toHaveLength(2);
    expect(meteoSvizzera?.payloads[0].date).toBe('2026-06-01');
    expect(meteoSvizzera?.payloads[1].date).toBe('2026-06-02');
  });

  it('returns empty array on non-JSON input', () => {
    const result = parseScoutOutput('not json');
    expect(result).toEqual([]);
  });

  it('returns empty array when top level is not an array', () => {
    const result = parseScoutOutput(JSON.stringify({ sourceName: 'x' }));
    expect(result).toEqual([]);
  });

  it('skips items with missing required fields', () => {
    const incomplete = [
      validOutput[0],
      { sourceName: 'BadSource', date: '2026-06-01' } // missing other fields
    ];
    const result = parseScoutOutput(JSON.stringify(incomplete));

    // Should only have MeteoSvizzera with 1 payload (the valid one)
    expect(result).toHaveLength(1);
    expect(result[0].sourceName).toBe('MeteoSvizzera');
  });

  it('extracts ForecastPayload fields correctly', () => {
    const result = parseScoutOutput(JSON.stringify(validOutput));

    const meteoPayload = result[0].payloads[0];
    expect(meteoPayload.source).toBe('MeteoSvizzera');
    expect(meteoPayload.date).toBe('2026-06-01');
    expect(meteoPayload.temperatureC).toBe(12);
    expect(meteoPayload.precipitationMm).toBe(0);
    expect(meteoPayload.windSpeedKmh).toBe(15);
    expect(meteoPayload.visibilityM).toBe(15000);
  });

  it('ignores extra fields in items', () => {
    const withExtra = [
      {
        ...validOutput[0],
        extraField: 'should be ignored',
        anotherExtra: 123
      }
    ];
    const result = parseScoutOutput(JSON.stringify(withExtra));

    expect(result).toHaveLength(1);
    expect(result[0].payloads).toHaveLength(1);
  });
});

describe('fetchScoutForecasts', () => {
  const validScoutOutput = [
    {
      sourceName: 'MeteoSvizzera',
      geographicMatchScore: 0.95,
      domainSpecialtyScore: 0.9,
      date: '2026-06-01',
      temperatureC: 12,
      precipitationMm: 0,
      windSpeedKmh: 15,
      visibilityM: 15000
    },
    {
      sourceName: 'MeteoSvizzera',
      geographicMatchScore: 0.95,
      domainSpecialtyScore: 0.9,
      date: '2026-06-02',
      temperatureC: 8,
      precipitationMm: 3.5,
      windSpeedKmh: 30,
      visibilityM: 7000
    }
  ];

  it('returns ScoutResult[] when runner returns valid JSON', async () => {
    mockExistsSync.mockImplementation((p) => p === `${homedir()}/.codex`);
    const mockRunner = vi
      .fn()
      .mockResolvedValue(JSON.stringify(validScoutOutput));

    const result = await fetchScoutForecasts(
      keyPoint,
      activity,
      scoutingNotes,
      dates,
      mockRunner
    );

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0].sourceName).toBe('MeteoSvizzera');
  });

  it('retries once on parse failure', async () => {
    mockExistsSync.mockImplementation((p) => p === `${homedir()}/.codex`);
    const mockRunner = vi
      .fn()
      .mockResolvedValueOnce('not valid json')
      .mockResolvedValueOnce(JSON.stringify(validScoutOutput));

    const result = await fetchScoutForecasts(
      keyPoint,
      activity,
      scoutingNotes,
      dates,
      mockRunner
    );

    expect(mockRunner).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1);
  });

  it('throws when both attempts fail', async () => {
    mockExistsSync.mockImplementation((p) => p === `${homedir()}/.codex`);
    const mockRunner = vi.fn().mockResolvedValue('bad output');

    await expect(
      fetchScoutForecasts(keyPoint, activity, scoutingNotes, dates, mockRunner)
    ).rejects.toThrow(/failed after retry/);
    expect(mockRunner).toHaveBeenCalledTimes(2);
  });

  it('returns empty array when dates is empty', async () => {
    const mockRunner = vi.fn();
    const result = await fetchScoutForecasts(
      keyPoint,
      activity,
      scoutingNotes,
      [],
      mockRunner
    );

    expect(result).toEqual([]);
    expect(mockRunner).not.toHaveBeenCalled();
  });
});
